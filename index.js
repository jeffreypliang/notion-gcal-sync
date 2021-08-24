const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const dotenv = require("dotenv");

dotenv.config();

const notionToken = process.env.NOTION_TOKEN;
const databaseId = process.env.NOTION_DATABASE_ID;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
const googleRedirectUrl = "https://developers.google.com/oauthplayground";

const googleAuth = createGoogleAuth();

listTaskLists(googleAuth);

/**
 * Creates an authorized OAuth2 client using credentials retrieved from the .env file.
 * 
 * @returns {google.auth.OAuth2} An authorized OAuth2 client.
 */
function createGoogleAuth() {
    let auth = new google.auth.OAuth2(
        googleClientId,
        googleClientSecret,
        googleRedirectUrl,
    );
    auth.setCredentials({
        refresh_token: googleRefreshToken
    });
    return auth;
}

/**
 * Lists the user's first 10 task lists.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listTaskLists(auth) {
    const service = google.tasks({ version: 'v1', auth });
    service.tasklists.list({
        maxResults: 10,
    }, (err, res) => {
        if (err) return console.error('The API returned an error: ' + err);
        const taskLists = res.data.items;
        if (taskLists) {
            console.log('Task lists:');
            taskLists.forEach((taskList) => {
                console.log(`${taskList.title} (${taskList.id})`);
            });
        } else {
            console.log('No task lists found.');
        }
    });
}