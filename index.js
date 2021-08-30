/**
 * Syncs Notion database to Google Calendar.
 * 
 * @author Jeffrey Liang
 */

const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const dotenv = require("dotenv");

dotenv.config();

const notionToken = process.env.NOTION_TOKEN;
const notionDatabaseId = process.env.NOTION_DATABASE_ID;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
const googleRedirectUrl = "https://developers.google.com/oauthplayground";
const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;

const pageFilter = {
    and: [
        {
            property: "Date",
            date: {
                is_not_empty: true,
            },
        },
        {
            property: "Type",
            select: {
                does_not_equal: "Lecture",
            },
        },
        {
            property: "Type",
            select: {
                does_not_equal: "Exam",
            }
        }
    ],
}

const googleAuth = createGoogleAuth();
const calendarClient = google.calendar({
    version: 'v3',
    auth: googleAuth,
});
const notionClient = new Client({
    auth: notionToken,
});

setInterval(sync, 60000);

/**
 * Syncs the given Notion database to the given Google Calendar.
 */
async function sync() {
    try {
        console.log("Syncing...");
        const pages = await getPages();
        await syncGCal(pages);
        await syncNotion(pages);
    } catch (error) {
        console.error(error);
    }
}

/**
 * Syncs events currently in the calendar with Notion.
 * 
 * @param {Map} pages A map, with page ids as keys and reduced pages as values.
 */
async function syncGCal(pages) {
    const events = await getEvents();
    for (const e of events) {
        const pageId = e.description;
        if (!pages.has(pageId)) {
            await calendarClient.events.delete({
                calendarId: googleCalendarId,
                eventId: e.id,
            });
        } else {
            const page = pages.get(pageId);
            const updatedEvent = createEvent(page);
            if (!eventsEqual(e, updatedEvent)) {
                await calendarClient.events.update({
                    calendarId: googleCalendarId,
                    eventId: e.id,
                    requestBody: updatedEvent,
                });
            }   
            pages.delete(pageId);
        }
    }
}

/**
 * Sync events not currently in the calendar with Notion.
 * 
 * @param {Map} pages A map, with page ids as keys and reduced pages as values.
 */
async function syncNotion(pages) {
    for (const [, page] of pages) {
        const event = createEvent(page);
        await calendarClient.events.insert({
            calendarId: googleCalendarId,
            requestBody: event,
        });
    }
}

/**
 * Creates an authorized OAuth2 client using the provided credentials.
 * 
 * @returns {google.auth.OAuth2} An authorized OAuth2 client.
 */
 function createGoogleAuth() {
    let auth = new google.auth.OAuth2(
        googleClientId,
        googleClientSecret,
        googleRedirectUrl,
    );
    auth.setCredentials({ refresh_token: googleRefreshToken });
    return auth;
}

/**
 * Returns a map of all pages in the specified database.
 * 
 * @returns {Map} A map, with page ids as keys and reduced pages as values.
 */
 async function getPages() {
    const pages = [];
    let cursor = undefined;
    do {
        const { results, next_cursor } = await notionClient.databases.query({
            database_id: notionDatabaseId,
            start_cursor: cursor,
            filter: pageFilter,
        });
        pages.push(...results);
        cursor = next_cursor;
    } while (cursor);
    return new Map(pages.map(page => [page.id, reducePage(page)]));
}

/**
 * Reduces a page object to only its necessary properties.
 * 
 * @param {Object} page A page object.
 * @returns {Object} An object containing the page's id, name, course, date, and status.
 */
function reducePage(page) {
    const reducedPage = {
        id: page.id,
        name: undefined,
        course: undefined,
        date: undefined,
        status: undefined,
    };
    if (page.properties["Name"].title[0]) {
        reducedPage.name = page.properties["Name"].title[0].plain_text;
    }
    if (page.properties["Course"].select) {
        reducedPage.course = page.properties["Course"].select.name;
    }
    if (page.properties["Date"].date) {
        if (page.properties["Date"].date.end) {
            reducedPage.date = page.properties["Date"].date.end;
        } else {
            reducedPage.date = page.properties["Date"].date.start;
        }
    }
    if (page.properties["Status"].select) {
        reducedPage.status = page.properties["Status"].select.name;
    }
    return reducedPage;
}

/**
 * Gets the events from the specified calendar.
 * 
 * @returns {Array} An array of events from the specified calendar.
 */
async function getEvents() {
    const events = [];
    let pageToken = undefined;
    do {
        const { data } = await calendarClient.events.list({
            calendarId: googleCalendarId,
            pageToken: pageToken,
        });
        events.push(...data.items);
        pageToken = data.nextPageToken;
    } while (pageToken);
    return events;
}

/**
 * Creates a Google Calendar event for the given page.
 * 
 * @param {Object} page An object containing the page's id, name, course, date, and status.
 * @returns {Object} A Google Calendar event.
 */
 function createEvent(page) {
    const event = {
        summary: "",
        description: page.id,
        start: undefined,
        end: undefined,
    };
    if (page.name) {
        if (page.course) {
            event.summary = `[${page.course}] ${page.name}`;
        } else {
            event.summary = page.name;
        }
    }
    if (page.status == "Done") {
        event.summary = `\u2705 ${event.summary}`;
    } else {
        event.summary = `\u274c ${event.summary}`;
    }
    if (page.date.length == 10) {
        const date = {
            date: page.date,
        }
        event.start = date;
        event.end = date;
    } else {
        const date = {
            dateTime: page.date,
        }
        event.start = date;
        event.end = date;
    }
    return event;
}

/**
 * Checks if two events are equal, based on the requirements for this script.
 * 
 * @param {Object} e1 A Google Calendar event.
 * @param {Object} e2 A Google Calendar event.
 */
function eventsEqual(e1, e2) {
    return e1.summary == e2.summary
        && e1.description == e2.description
        && e1.start.date == e2.start.date
        && Date.parse(e1.start.dateTime) == Date.parse(e2.start.dateTime)
        && e1.end.date == e2.end.date
        && Date.parse(e1.end.dateTime) == Date.parse(e2.end.dateTime);
}

/**
 * Returns the given string, but as strikethrough text.
 * 
 * @param {string} text A string.
 * @returns {string} The given string as strikethrough text.
 */
 function strikeThrough(text) {
    return text.split('').map(char => char + '\u0336').join('');
}
