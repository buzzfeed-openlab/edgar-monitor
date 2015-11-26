
var request = require('request'),
    fs = require('fs'),
    exec = require('child_process').exec,
    Diff2Html = require('diff2html').Diff2Html,
    pg = require('pg'),
    cheerio = require('cheerio');

var EdgarWatcher = module.exports = function(emitter, config) {
    emitter.on('new-entry', function(entry, feed) {
        if (typeFromTitle(entry.title) != "S-1") {
            return;
        }

        findOlderVersionOfEntry(entry, feed, config.databaseUrl, function(oldEntry) {

            getDocLinkFromEntry(entry, function(newLink) {
                getDocLinkFromEntry(oldEntry, function(oldLink) {

                    var entryDoc = typeFromTitle(entry.title) + '-' + Date.parse(entry.date),
                        oldEntryDoc = typeFromTitle(oldEntry.title) + '-' + Date.parse(oldEntry.date);

                    diffDocs(oldLink, oldEntryDoc, newLink, entryDoc, function(diff) {
                        var body = Diff2Html.getPrettyHtml(diff, { inputFormat: 'diff' }),
                            html = buildDiffHtml(body);

                        fs.writeFileSync(entry.guid + '.html', html);
                    });

                });
            });

        });
    });
}

function handleError(err) {
    if (err) {
        console.log('Error:');
        console.log(err);
        return true;
    }

    return false;
}

function multiGet(urls, cb) {
    var results = {},
    countFinished = 0;

    function handler(error, response, body) {
        var url = response.request.uri.href;

        results[url] = { error: error, response: response, body: body };

        if (++countFinished === urls.length) {
            cb(results);
        }
    };

    for (var i = 0; i < urls.length; ++i) {
        request(urls[i], handler);
    }
};

function diffDocs(url1, title1, url2, title2, cb) {
    exec('w3m -dump -cols 200 ' + url1 + ' > "' + title1 + '"', function(err) {
        if (handleError(err)) { return; }

        exec('w3m -dump -cols 200 ' + url2 + ' > "' + title2 + '"', function(err) {
            if (handleError(err)) { return; }

            var oneGigInBytes = 1073741824;
            exec('git diff --ignore-all-space --no-index "' + title1 + '" "' + title2 + '"',
                { maxBuffer: oneGigInBytes - 1 }, function(err, stdout) {
                    if (err && err.code != 1) {
                        return handleError(err);
                    }

                cb(stdout);
            });
        });
    });
}

function buildDiffHtml(body) {
    return '<!doctype html>' +
        '<html lang="en">' +
        '<head>' +
            '<meta charset="utf-8">' +
     
            '<link rel="stylesheet" href="./s1-static/github.min.css">' +
     
            '<link rel="stylesheet" type="text/css" href="./s1-static/diff2html.min.css">' +
            '<script type="text/javascript" src="./s1-static/diff2html.min.js"></script>' +
     
        '</head>' +
        '<body style="text-align: center; font-family: \'Source Sans Pro\',sans-serif;">' +
         
        body +
     
        '</body>' +
        '</html>';
}

function typeFromTitle(title) {
    var normTitle = title.toUpperCase().trim();

    if (normTitle.indexOf('S-1') == 0) { return 'S-1'; }
    if (normTitle.indexOf('CT ORDER') == 0) { return 'CT ORDER'; }
    if (normTitle.indexOf('S-8') == 0) { return 'S-8'; }
    if (normTitle.indexOf('EFFECT') == 0) { return 'EFFECT'; }
    if (normTitle.indexOf('CERTNYS') == 0) { return 'CERTNYS'; }
    if (normTitle.indexOf('FWP') == 0) { return 'FWP'; }
    if (normTitle.indexOf('8-A12B') == 0) { return '8-A12B'; }
    if (normTitle.indexOf('DRS') == 0) { return 'DRS'; }
    if (normTitle.indexOf('D') == 0) { return 'D'; }

    return 'UNKNOWN';
}

function normalizeLink(link) {
    return link.replace(/^(https:\/\/)/, "")
        .replace(/^(http:\/\/)/, "")
        .replace(/^(www\.)/, "");
}

function findOlderVersionOfEntry(entry, feed, databaseUrl, cb) {
    var entryType = typeFromTitle(entry.title),
        entryDate = new Date(entry.date),
        entryLink = normalizeLink(entry.link);

    pg.connect(databaseUrl, function(err, client, done) {
        if (handleError(err)) { return done(client); }

        // slect all the entries because we don't have a way to filter on filing type
        client.query('SELECT * from entries WHERE feed = $1 ORDER BY date DESC', [feed], function(err, result) {
            if (handleError(err)) { return done(client); }

            for (var i = 0; i < result.rows.length; ++i) {
                var row = result.rows[i],
                    rowType = typeFromTitle(row.title),
                    rowDate = new Date(row.date),
                    rowLink = normalizeLink(row.link);

                if (rowType == entryType && rowDate < entryDate && rowLink != entryLink) {
                    // found the most recent previous filing of the same type
                    cb(row);
                    break;
                }
            }

            done();
        });
    });
}

function getDocLinkFromEntry(entry, cb) {
    request(entry.link, function(err, response, body) {
        var entryType = typeFromTitle(entry.title),
            $ = cheerio.load(body);

        var docRow = $('.tableFile tr').filter(function(index) {
            var children = $(this).children();
            return $(children[3]).text().indexOf(entryType) != -1;
        });

        var edgarSite = 'https://www.sec.gov',
            docLink = edgarSite + $(docRow.children()[2]).find('a').attr('href');

        cb(docLink);
    });
}
