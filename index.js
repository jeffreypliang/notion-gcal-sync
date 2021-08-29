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
    or: [
        {
            property: "Type",
            select: {
                equals: "Lab"
            }
        },
        {
            property: "Type",
            select: {
                equals: "Quiz"
            }
        },
        {
            property: "Type",
            select: {
                equals: "Homework"
            }
        },
        {
            property: "Type",
            select: {
                equals: "Project"
            }
        },
        {
            property: "Type",
            select: {
                equals: "Extra Credit"
            }
        },
    ]
}

const googleAuth = createGoogleAuth();
const calendarClient = google.calendar({
    version: 'v3',
    auth: googleAuth,
});
const notionClient = new Client({ auth: notionToken });

// setInterval(sync, 30000);
sync();

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
 * Syncs the given Notion database to the given Google Calendar.
 */
async function sync() {
    const pages = await getPages();
    await syncGCal(pages);
    await syncNotion(pages);
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

async function getPage(pageId) {
    try {
        const page = await notionClient.pages.retrieve({ page_id: pageId });
        return reducePage(page);
    } catch (error) {
        return undefined;
    }
}

/**
 * Reduces a page object to only its necessary properties.
 * 
 * @param {Object} page A page object.
 * @returns {Object} An object containing the pages id, name, course, date, and status.
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
 * Syncs events currently in the calendar with Notion.
 * 
 * @param {Map} pages A map, with page ids as keys and reduced pages as values.
 */
async function syncGCal(pages) {
    const events = await getEvents();
    for (e of events) {
        const pageId = e.description;
        const page = await getPage(pageId);
        if (!page) {
            await calendarClient.events.delete({
                calendarId: googleCalendarId,
                eventId: e.id,
            });
        } else {
            const event = createEvent(page);
            await calendarClient.events.update({
                calendarId: googleCalendarId,
                eventId: e.id,
                requestBody: event,
            });
            pages.delete(page.id);
        }
    }
}

/**
 * Sync events not currently in the calendar with Notion.
 * 
 * @param {Map} pages A map, with page ids as keys and reduced pages as values.
 */
async function syncNotion(pages) {
    for (const [pageId, page] of pages) {
        const event = createEvent(page);
        await calendarClient.events.insert({
            calendarId: googleCalendarId,
            requestBody: event,
        });
    }
}

function createEvent(page) {
    const event = {
        summary: "",
        description: page.id,
        start: {
            dateTime: page.date,
        },
        end: {
            dateTime: page.date,
        },
    };
    if (page.name) {
        if (page.course) {
            event.summary = `[${page.course}] ${page.name}`;
        } else {
            event.summary = page.name;
        }
    }
    if (page.status == "Done") {
        event.summary = strikeThrough(event.summary);
    }
    return event;
}

function strikeThrough(text) {
    return text.split('').map(char => char + '\u0336').join('');
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
        events.push(...data.items)
        pageToken = data.nextPageToken;
    } while (pageToken);
    return events;
}

async function getTasks() {
    const tasks = [];
    const taskList = await getTaskList();
    let pageToken = undefined;
    do {
        const { data } = await calendarClient.calendarList.list({
            tasklist: taskList,
            pageToken: pageToken,
            showCompleted: true,
            showHidden: true,
            maxResults: 1,
        });
        if (data.items) {
            tasks.push(...data.items);
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    return tasks;
}

/**
 * 
 * @param {string} str
 * @returns 
 */
function formatDateRFC(dateString) {
    const date = new Date(Date.parse(dateString));
    function pad(n) {
        return n < 10 ? '0' + n : n;
    }
    return date.getUTCFullYear()+'-'
         + pad(date.getUTCMonth()+1)+'-'
         + pad(date.getUTCDate())+'T'
         + pad(date.getUTCHours())+':'
         + pad(date.getUTCMinutes())+':'
         + pad(date.getUTCSeconds())+'Z';
}
