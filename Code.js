/**
 * Syncs a Notion database to Google Calendar.
 * 
 * @author Jeffrey Liang
 */

const properties = PropertiesService.getScriptProperties();
const NOTION_API_KEY = properties.getProperty("notionApiKey");
const NOTION_DATABASE_ID = properties.getProperty("notionDatabaseId");
const GOOGLE_CALENDAR_ID = properties.getProperty("googleCalendarId");

const NOTION_URL = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
const NOTION_REQUEST_PARAMS = {
  "muteHttpExceptions": true,
  "method": "post",
  "headers": {
    "Authorization": `Bearer ${NOTION_API_KEY}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  },
};
const PAGE_FILTER = {
  "property": "Date",
  "date": {
    "is_not_empty": true,
  },
};

const CALENDAR = CalendarApp.getCalendarById(GOOGLE_CALENDAR_ID);

function sync() {
  const pages = getPages();
  syncGCal(pages);
  syncNotion(pages);
}

/**
 * Returns a map of all pages in the Notion database.
 * 
 * @returns {Map} A map with page ids as keys and reduced pages as values.
 */
function getPages() {
  const pages = [];
  let cursor;
  do {
    NOTION_REQUEST_PARAMS.payload = JSON.stringify({
      "start_cursor": cursor,
      "filter": PAGE_FILTER,
    });
    const { results, next_cursor } = JSON.parse(UrlFetchApp.fetch(NOTION_URL, NOTION_REQUEST_PARAMS).getContentText());
    pages.push(...results);
    cursor = next_cursor;
  } while (cursor);
  return new Map(pages.map(page => [page.id, reducePage(page)]));
}

/**
 * Syncs events currently in the calendar with Notion.
 *
 * @param {Map} pages A map, with page ids as keys and reduced
 */
function syncGCal(pages) {
  const events = CALENDAR.getEvents(new Date(-8640000000000000), new Date(8640000000000000));
  for (const event of events) {
    const pageId = event.getDescription();
    if (pages.has(pageId)) {
      const page = pages.get(pageId);
      event.setTitle(pageToEventTitle(page));
      if (page.date.length === 10) {
        event.setAllDayDate(new Date(page.date.replace("-", "/")));
      } else {
        event.setTime(new Date(page.date), new Date(page.date));
      }
      pages.delete(pageId);
    } else {
      event.deleteEvent();
    }
  }
}

/**
 * Sync events not currently in the calendar with Notion.
 * 
 * @param {Map} pages A map, with page ids as keys and reduced pages as values.
 */
function syncNotion(pages) {
  for (const [, page] of pages) {
    if (page.date.length === 10) {
      const event = CALENDAR.createAllDayEvent(pageToEventTitle(page), new Date(page.date.replace("-", "/")));
      event.setDescription(page.id);
    } else {
      const event = CALENDAR.createEvent(pageToEventTitle(page), new Date(page.date), new Date(page.date));
      event.setDescription(page.id);
    }
  }
}

/**
 * Reduces a page object to only its necessary properties.
 * 
 * @param   {Object}  page  A page object.
 * @returns {Object}        An object containing the page's id, name, course, date, and status.
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
  if (page.properties["Status"].status) {
    reducedPage.status = page.properties["Status"].status.name;
  }
  return reducedPage;
}

/**
 * Returns the event title for the given page.
 * 
 * @returns {String}  The event title derived from the page.
 */
function pageToEventTitle(page) {
  title = "";
  if (page.name) {
    if (page.course) {
      title = `[${page.course}] ${page.name}`;
    } else {
      title = page.name;
    }
  }
  if (page.status === "Done") {
    title = `\u2705 ${title}`;
  } else {
    title = `\u274c ${title}`;
  }
  return title;
}
