// Hub a Nice Day - GAS server v7 (auto-split large values to avoid 50000 char/cell limit)

const SHEET_NAME = 'hubdata';
const BACKUP_SHEET_PREFIX = 'backup_';
const BACKUP_KEEP_DAYS = 90;
const HUB_API_KEY = 'hub2026SandaHonten!9xKy';

var CHUNK_SIZE = 40000;
var CHUNK_MARKER = '__CHUNKED__:';

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1).setValue('key');
    sheet.getRange(1, 2).setValue('value');
    sheet.getRange(1, 3).setValue('updated');
  }
  return sheet;
}

function findRow(sheet, key) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) return i + 1;
  }
  return -1;
}

function makeResponse(text) {
  var output = ContentService.createTextOutput(text);
  output.setMimeType(ContentService.MimeType.TEXT);
  return output;
}

function writeRow(sheet, key, value, now) {
  var row = findRow(sheet, key);
  if (row === -1) {
    sheet.appendRow([key, value, now]);
  } else {
    sheet.getRange(row, 2).setValue(value);
    sheet.getRange(row, 3).setValue(now);
  }
}

function deleteChunks(sheet, key) {
  var data = sheet.getDataRange().getValues();
  var prefix = key + '__chunk';
  var rowsToDelete = [];
  for (var i = 1; i < data.length; i++) {
    var k = data[i][0];
    if (k && String(k).indexOf(prefix) === 0) rowsToDelete.push(i + 1);
  }
  rowsToDelete.sort(function(a, b) { return b - a; });
  rowsToDelete.forEach(function(r) { sheet.deleteRow(r); });
}

function invalidateCache(key) {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove(key);
    for (var i = 0; i < 100; i++) cache.remove(key + '__chunk' + i);
  } catch (ce) {}
}

function doGet(e) {
  if (!e.parameter || e.parameter.apiKey !== HUB_API_KEY) {
    return makeResponse('unauthorized');
  }
  try {
    var key = e.parameter && e.parameter.key;
    if (!key) return makeResponse('null');

    var cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached !== null && cached.indexOf(CHUNK_MARKER) !== 0) {
      return makeResponse(cached);
    }

    var sheet = getSheet();
    var row = findRow(sheet, key);
    if (row === -1) return makeResponse('null');
    var value = sheet.getRange(row, 2).getValue();
    value = (value === '' || value === null || value === undefined) ? 'null' : String(value);

    if (value.indexOf(CHUNK_MARKER) === 0) {
      var numChunks = parseInt(value.substring(CHUNK_MARKER.length), 10) || 0;
      var data = sheet.getDataRange().getValues();
      var prefix = key + '__chunk';
      var chunkMap = {};
      for (var i = 1; i < data.length; i++) {
        var k = data[i][0];
        if (k && String(k).indexOf(prefix) === 0) {
          var idx = parseInt(String(k).substring(prefix.length), 10);
          chunkMap[idx] = data[i][1];
        }
      }
      var result = '';
      for (var j = 0; j < numChunks; j++) {
        result += (chunkMap[j] !== undefined && chunkMap[j] !== null) ? String(chunkMap[j]) : '';
      }
      if (!result) result = 'null';
      try { if (result.length < 90000) cache.put(key, result, 60); } catch (ce) {}
      return makeResponse(result);
    }

    try { cache.put(key, value, 60); } catch (ce) {}
    return makeResponse(value);
  } catch (err) {
    return makeResponse('error: ' + err.message);
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try { lock.waitLock(8000); locked = true; } catch (le) {
    return makeResponse('error: lock_timeout');
  }
  try {
    var contents = e.postData && e.postData.contents;
    if (!contents) return makeResponse('error: no body');
    var body;
    try { body = JSON.parse(contents); } catch (ex) { return makeResponse('error: invalid JSON'); }
    if (body.apiKey !== HUB_API_KEY) { return makeResponse('unauthorized'); }
    var key = body.key;
    var value = body.value;
    if (!key) return makeResponse('error: no key');

    var sheet = getSheet();
    var now = new Date().toLocaleString('ja-JP');
    var str = (value === null || value === undefined) ? '' : String(value);

    deleteChunks(sheet, key);

    if (str.length <= CHUNK_SIZE) {
      writeRow(sheet, key, str, now);
    } else {
      var numChunks = Math.ceil(str.length / CHUNK_SIZE);
      writeRow(sheet, key, CHUNK_MARKER + numChunks, now);
      for (var i = 0; i < numChunks; i++) {
        var chunk = str.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        writeRow(sheet, key + '__chunk' + i, chunk, now);
      }
    }

    invalidateCache(key);
    return makeResponse('ok');
  } catch (err) {
    return makeResponse('error: ' + err.message);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function dailyBackup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var source = getSheet();
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  var sheetName = BACKUP_SHEET_PREFIX + y + m + d;
  var existing = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);
  var copy = source.copyTo(ss);
  copy.setName(sheetName);
  ss.moveActiveSheet(ss.getSheets().length);
  cleanupOldBackups();
  Logger.log('backup done: ' + sheetName);
}

function cleanupOldBackups() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var now = new Date();
  var limitMs = BACKUP_KEEP_DAYS * 24 * 60 * 60 * 1000;
  sheets.forEach(function(sheet) {
    var name = sheet.getName();
    if (name.indexOf(BACKUP_SHEET_PREFIX) !== 0) return;
    var dateStr = name.replace(BACKUP_SHEET_PREFIX, '');
    if (dateStr.length !== 8) return;
    var y = parseInt(dateStr.substring(0, 4), 10);
    var m = parseInt(dateStr.substring(4, 6), 10) - 1;
    var d = parseInt(dateStr.substring(6, 8), 10);
    var sheetDate = new Date(y, m, d);
    if (now - sheetDate > limitMs) {
      ss.deleteSheet(sheet);
      Logger.log('deleted old backup: ' + name);
    }
  });
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'dailyBackup') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('dailyBackup')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  Logger.log('trigger registered');
}
