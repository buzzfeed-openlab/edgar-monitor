
var request = require('request'),
    fs = require('fs'),
    exec = require('child_process').exec,
    Diff2Html = require('diff2html').Diff2Html,
    pg = require('pg'),
    cheerio = require('cheerio'),
    uuid = require('node-uuid'),
    aws = require('aws-sdk'),
    ses = new aws.SES({ apiVersion: '2010-12-01', 'region': 'us-east-1' });

var diffAndNotify = ['S-1'],
    notify = [
        // 'CT ORDER',
        // 'S-8',
        // 'EFFECT',
        // 'CERTNYS',
        // 'FWP',
        // '8-A12B',
        // 'DRS',
        // 'D'
    ];

function handleError(err) {
    if (err) {
        console.log('Error:');
        console.log(err);
        return true;
    }

    return false;
}

var EdgarWatcher = module.exports = function(emitter, config) {
    emitter.on('new-entry', function(entry, feed) {
        var entryType = typeFromTitle(entry.title);

        if (diffAndNotify.indexOf(entryType) != -1) {
            diffEntry(entry, feed, config, function(err, diffLink) {
                handleError(err);
                notifyEntry(entry, feed, config, diffLink);
            });
        } else if (notify.indexOf(entryType) != -1) {
            notifyEntry(entry, feed, config);
        }
    });
}

function notifyEntry(entry, feed, config, extraResource) {
    var bodyText = entry.toString();
    if (extraResource) {
        bodyText += '\n\n' + extraResource;
    }

    var email = {
        Source: config.emailSource,

        Destination: {
            BccAddresses: config.emails
        },

        Message: {
            Subject: {
                Data: 'New Entry: ' + entry.title
            },
            Body: {
                Text: {
                    Data: bodyText
                }
            }
        }
    }

    ses.sendEmail(email, function(err, data) {
        if (err) { return console.log(err, err.stack); }
        console.log(data);
    });
}

function diffEntry(entry, feed, config, cb) {
    var entryType = typeFromTitle(entry.title);

    findOlderVersionOfEntry(entry, feed, config.databaseUrl, function(err, oldEntry) {
        if (err) { return cb(err); }

        if (!oldEntry) { return cb(null, null); }

        getDocLinkFromEntry(entry, function(err, newLink) {
            if (err) { cb(err); }

            getDocLinkFromEntry(oldEntry, function(err, oldLink) {
                if (err) { cb(err); }

                diffDocs(oldLink, newLink, function(err, diff) {
                    if (err) { cb(err); }

                    var body = Diff2Html.getPrettyHtml(diff, { inputFormat: 'diff' }),
                        html = buildDiffHtml(body);

                    fs.writeFileSync(entry.guid + '.html', html);

                    cb(null, 'wouldBeLinkToDiff.html');
                });

            });
        });

    });

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
}

function diffDocs(url1, url2, cb) {
    var doc1 = uuid.v4(),
        doc2 = uuid.v4();

    exec('w3m -dump -cols 200 ' + url1 + ' > "' + doc1 + '"', function(err) {
        if (err) { return cb(err); }

        exec('w3m -dump -cols 200 ' + url2 + ' > "' + doc2 + '"', function(err) {
            if (err) { return cb(err); }

            var oneGigInBytes = 1073741824;
            exec('git diff --ignore-all-space --no-index "' + doc1 + '" "' + doc2 + '"',
                { maxBuffer: oneGigInBytes - 1 }, function(err, stdout) {

                // git diff returns 1 when it found a difference
                if (err && err.code == 1) {
                    err = null;
                }

                cb(err, stdout);
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
        if (err) {
            cb(err);
            return done(client);
        }

        // slect all the entries because we don't have a way to filter on filing type
        client.query('SELECT * from entries WHERE feed = $1 ORDER BY date DESC', [feed], function(err, result) {
            if (err) {
                cb(err);
                return done(client);
            }

            var foundEntry = false;
            for (var i = 0; i < result.rows.length; ++i) {
                var row = result.rows[i],
                    rowType = typeFromTitle(row.title),
                    rowDate = new Date(row.date),
                    rowLink = normalizeLink(row.link);

                if (rowType == entryType && rowDate < entryDate && rowLink != entryLink) {
                    foundEntry = true;
                    cb(null, row);
                    break;
                }
            }

            if (!foundEntry) {
                cb(null, null);
            }

            done();
        });
    });
}

function getDocLinkFromEntry(entry, cb) {
    request(entry.link, function(err, response, body) {
        if (err) { cb(err); }

        var entryType = typeFromTitle(entry.title),
            $ = cheerio.load(body);

        var docRow = $('.tableFile tr').filter(function(index) {
            var children = $(this).children();
            return $(children[3]).text().indexOf(entryType) != -1;
        });

        var edgarSite = 'https://www.sec.gov',
            docLink = edgarSite + $(docRow.children()[2]).find('a').attr('href');

        cb(null, docLink);
    });
}
