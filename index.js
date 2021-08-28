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
// await sync();

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
    syncCalendar(pages);
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

async function syncCalendar(pages) {
    return;
}

/**
 * Reduces a page object to only its necessary properties.
 * 
 * @param {Object} page A page object.
 * @returns {Object} An object containing the pages id, name, course, date, and status.
 */
function reducePage(page) {
    let name = undefined;
    let course = undefined;
    let date = undefined;
    let status = undefined;
    if (page.properties["Name"].title[0]) {
        name = page.properties["Name"].title[0].plain_text;
    }
    if (page.properties["Course"].select) {
        course = page.properties["Course"].select.name;
    }
    if (page.properties["Date"].date) {
        if (page.properties["Date"].date.end) {
            date = formatDateRFC(page.properties["Date"].date.end);
        } else {
            date = formatDateRFC(page.properties["Date"].date.start);
        }
    }
    if (page.properties["Status"].select) {
        status = page.properties["Status"].select.name;
    }
    return {
        id: page.id,
        name: name,
        course: course,
        date: date,
        status: status,
    };
}

async function addTasks() {
    const taskList = await getTaskList();
    const pages = await getPages();
    for (const [key, value] of pages) {
        let title = "";
        let status = "needsAction";
        let due = value.date;
        if (value.name) {
            if (value.course) {
                title = `[${value.course}] ${value.name}`;
            } else {
                title = value.name;
            }
        }
        if (value.status == "Done") {
            status = "completed";
        }
        calendarClient.tasks.insert({
            tasklist: taskList,
            requestBody: {
                title: title,
                notes: key,
                status: status,
                due: due,
            }
        });
    }
}

async function updateTasks() {
    const taskList = await getTaskList();
    const tasks = await getTasks();
    for (const task of tasks) {
        pageId = task.notes;
        const page = await notionClient.pages.retrieve({
            page_id: pageId,
        });
        console.log(page);
        let name = undefined;
        let course = undefined;
        let date = undefined;
        let status = undefined;
        if (page.properties["Name"].title[0]) {
            name = page.properties["Name"].title[0].plain_text;
        }
        if (page.properties["Course"].select) {
            course = page.properties["Course"].select.name;
        }
        if (page.properties["Date"].date) {
            if (page.properties["Date"].date.end) {
                date = formatDateRFC(page.properties["Date"].date.end);
            } else {
                date = formatDateRFC(page.properties["Date"].date.start);
            }
        }
        if (page.properties["Status"].select) {
            status = page.properties["Status"].select.name;
        }
        calendarClient.tasks.update({
            tasklist: taskList,
            task: task.id,
            requestBody: {
                id: task.id,
                title: name,
                notes: pageId,
                status: status,
                due: date,
            }
        })
    }
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

async function getTaskList() {
    let pageToken = undefined;
    do {
        const { data } = await calendarClient.calendarList.list({
            pageToken: pageToken,
        });
        for (const list of data.items) {
            if (list.title == googleTaskListTitle) {
                return list.id;
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
}

function formatDateRFC(str) {
    const d = new Date(Date.parse(str));
    function pad(n) {
        return n < 10 ? '0' + n : n;
    }
    return d.getUTCFullYear()+'-'
         + pad(d.getUTCMonth()+1)+'-'
         + pad(d.getUTCDate())+'T'
         + pad(d.getUTCHours())+':'
         + pad(d.getUTCMinutes())+':'
         + pad(d.getUTCSeconds())+'Z';
}
