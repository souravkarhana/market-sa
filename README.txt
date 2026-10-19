MARKET SA ON GITHUB  (free, runs by itself, no computer needed)

ONE-TIME SETUP (about 10 minutes)
1. Make a free account on github.com and click New repository. Name: market-sa. Choose Public. Create.
2. Click "uploading an existing file". Drag ALL files and folders from this folder in
   (index.html, history.json, daily_update.py, template.html, core.js, incoming folder, .github folder). Click Commit changes.
   If the .github folder did not upload: click Add file > Create new file, type the name  .github/workflows/update.yml
   and paste the contents of the file update.yml.txt. Commit.
3. Settings > Pages > Source: "Deploy from a branch", Branch: main, folder: / (root). Save.
   After a minute your page is live at  https://YOUR-USERNAME.github.io/market-sa/
   Bookmark this link on phone and computer.
4. Actions tab > "Daily market update" > Run workflow  (first test; fills the days after 9 Oct).
   Then it runs by itself every weekday evening (7 PM and 9 PM IST).

IF NSE BLOCKS GITHUB'S SERVER (Actions log says "no file ... blocked")
Download the bhavcopy CSV by hand from nseindia.com (All Reports > CM-UDiFF Common Bhavcopy Final, unzip it)
and upload the CSV into the "incoming" folder of your repository (Add file > Upload files).
The workflow starts by itself, adds the day and updates the page.

Page not updated? Actions tab > open the last run > read the log.
