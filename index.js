const { Client } = require("@notionhq/client");
const { google, tasks_v1 } = require("googleapis");
const dotenv = require("dotenv");

dotenv.config();

const notionToken = process.env.NOTION_TOKEN;
const notionDatabaseId = process.env.NOTION_DATABASE_ID;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
const googleRedirectUrl = "https://developers.google.com/oauthplayground";
const googleTaskListTitle = process.env.GOOGLE_TASK_LIST_TITLE;

const googleAuth = createGoogleAuth();

const tasksClient = google.tasks({
    version: 'v1',
    auth: googleAuth,
});
const notionClient = new Client({ auth: notionToken });

getTaskList();

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

async function getFromNotion() {
    const pages = [];
    let cursor = undefined;
    do {
        const { results, next_cursor } = await notionClient.databases.query({
            database_id: notionDatabaseId,
            start_cursor: cursor,
            filter: {
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
            },
        });
        pages.push(...results);
        cursor = next_cursor;
    } while (cursor);
    return pages;
}

async function getTaskList() {
    let pageToken = undefined;
    do {
        const { data } = await tasksClient.tasklists.list({
            pageToken: pageToken,
        })
        for (const list of data.items) {
            if (list.title == googleTaskListTitle) {
                console.log(list);
                return list;
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
}
