# Monthly Devotion Schedules Guide

Adding a new month to **Daily Devotions** is simple and takes just 2 quick steps:

### Step 1: Create the month schedule JSON
Create a file named `YYYY-MM.json` (e.g. `2027-01.json`) inside this directory:
```json
{
  "title": "Daily Devotions Guide - January 2027",
  "readingPlan": "The BIBLE with Nicky and Pippa Gumbel",
  "monthKey": "2027-01",
  "monthName": "January 2027",
  "year": 2027,
  "month": 1,
  "days": [
    {
      "day": 1,
      "date": "2027-01-01",
      "scriptures": "Psalms 1, Matthew 1, Genesis 1 ; 2",
      "count": 3,
      "time": "12m 00s",
      "dayOfYear": 1,
      "passages": [
        { "bookId": "PSA", "bookName": "Psalms", "chapter": 1, "fromVerse": null, "toVerse": null, "label": "Psalms 1", "section": "Wisdom" },
        { "bookId": "MAT", "bookName": "Matthew", "chapter": 1, "fromVerse": null, "toVerse": null, "label": "Matthew 1", "section": "New Testament" },
        { "bookId": "GEN", "bookName": "Genesis", "chapter": 1, "fromVerse": null, "toVerse": null, "label": "Genesis 1", "section": "Old Testament" }
      ]
    }
  ]
}
```

### Step 2: Register the month in `registry.json`
Add an entry to `data/schedules/registry.json`:
```json
{
  "key": "2027-01",
  "name": "January 2027",
  "path": "./data/schedules/2027-01.json",
  "daysCount": 31,
  "isDefault": false
}
```

The app will immediately discover the month, list it in the month picker on the Devotion, Calendar, and Journal pages, and enable reading, caching, and text-to-speech without changing any code!
