(function(window, undefined) {
    var pollTimer = null;
    var lastSelectionSnapshot = '';
    var suppressSelectionSyncUntil = 0;

    var parentOrigin = '*';
    try {
        if (document.referrer) {
            parentOrigin = new URL(document.referrer).origin;
        }
    } catch (e) {}

    function postToParent(payload) {
        window.top.postMessage(payload, '*');
    }

    function getSelectedText(callback) {
        window.Asc.plugin.executeMethod('GetSelectedText', [{
            Numbering: false,
            Math: false,
            TableCellSeparator: '\n',
            ParaSeparator: '\n',
            TabSymbol: String.fromCharCode(9)
        }], function(text) {
            callback(String(text || ''));
        });
    }

    function escapeXml(unsafe) {
        return String(unsafe || '').replace(/[<>&'\"]/g, function(c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
    }

    function normalizeWhitespace(text) {
        return String(text || '')
            .replace(/\r\n?/g, '\n')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n');
    }

    function isHeadingLine(line) {
        var trimmed = String(line || '').trim();
        if (!trimmed) return false;

        if (/^(ARTICLE|SECTION|CLAUSE|INTRODUCTION|BACKGROUND|SUMMARY|CONCLUSION|PRAYER|RELIEF|DEFINITIONS)\b/i.test(trimmed)) {
            return true;
        }

        return trimmed.length <= 60 && !/[.!?]$/.test(trimmed) && trimmed === trimmed.toUpperCase();
    }

    function isListLine(line) {
        return /^\s*(?:\d+[\).]|[a-zA-Z][\).]|[-*])\s+/.test(String(line || ''));
    }

    function formatPlainText(text) {
        var normalized = normalizeWhitespace(text);
        var lines = normalized.split('\n');
        return lines.map(function(line) {
            return String(line || '').replace(/[ \t]{2,}/g, ' ').trimEnd();
        }).join('\n').trim();
    }

    function createCaseNameRuns(line) {
        var caseRegex = /\b([A-Z][A-Za-z0-9.&'/-]*(?:\s+[A-Z][A-Za-z0-9.&'/-]*)*)\s+v\.?\s+([A-Z][A-Za-z0-9.&'/-]*(?:\s+[A-Z][A-Za-z0-9.&'/-]*)*)\b|\bIn\s+re\s+([A-Z][A-Za-z0-9.&'/-]*(?:\s+[A-Z][A-Za-z0-9.&'/-]*)*)\b/g;
        var runXml = '';
        var cursor = 0;
        var match;

        function appendRun(text, bold, italic) {
            if (!text) return;
            runXml += '<w:r><w:rPr>';
            if (bold) runXml += '<w:b/>';
            if (italic) runXml += '<w:i/>';
            runXml += '</w:rPr><w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>';
        }

        while ((match = caseRegex.exec(line)) !== null) {
            if (match.index > cursor) {
                appendRun(line.slice(cursor, match.index), false, false);
            }
            appendRun(match[0], true, true);
            cursor = match.index + match[0].length;
        }

        if (cursor < line.length) {
            appendRun(line.slice(cursor), false, false);
        }

        return runXml || '<w:r><w:t xml:space="preserve">' + escapeXml(line) + '</w:t></w:r>';
    }

    function buildOoxml(text) {
        var paragraphs = [];
        var lines = normalizeWhitespace(text).split('\n');

        lines.forEach(function(rawLine) {
            var line = String(rawLine || '').trim();
            if (!line) {
                paragraphs.push('<w:p/>');
                return;
            }

            var pPr = '';
            var runs = '';

            if (isHeadingLine(line)) {
                runs = '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + escapeXml(line) + '</w:t></w:r>';
                pPr = '<w:pPr><w:jc w:val="left"/></w:pPr>';
            } else {
                runs = createCaseNameRuns(line);
            }

            paragraphs.push('<w:p>' + pPr + runs + '</w:p>');
        });

        return '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
            paragraphs.join('') +
            '<w:sectPr/></w:body></w:document>';
    }

    function emitSelectionState(text) {
        var snapshot = String(text || '').replace(/\s+$/g, '');
        if (snapshot === lastSelectionSnapshot) return;
        lastSelectionSnapshot = snapshot;
        postToParent({
            type: 'ONLYOFFICE_SELECTION_STATE',
            text: snapshot,
            hasSelection: !!snapshot.trim()
        });
    }

    function syncCurrentSelection() {
        var now = Date.now();
        if (now < suppressSelectionSyncUntil) return;

        getSelectedText(function(text) {
            emitSelectionState(text);
        });
    }

    function startSelectionWatcher() {
        if (pollTimer) return;
        syncCurrentSelection();
        pollTimer = window.setInterval(syncCurrentSelection, 400);
    }

    function stopSelectionWatcher() {
        if (pollTimer) {
            window.clearInterval(pollTimer);
            pollTimer = null;
        }
        lastSelectionSnapshot = '';
    }

    function convertUrlsToLinksInHtml(htmlContent) {
        if (!htmlContent) return '';

        // 1. Convert markdown style links: [Label](http://...)
        var mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+|www\.[^\s\)]+|indiankanoon\.org\/[^\s\)]+)\)/gi;
        var processed = htmlContent.replace(mdLinkRegex, function(_, label, rawUrl) {
            var fullUrl = rawUrl.startsWith('http') ? rawUrl : ('https://' + rawUrl);
            return '<a href="' + fullUrl + '" target="_blank" style="color: #2563eb; text-decoration: underline; font-weight: 500;">' + label + '</a>';
        });

        // 2. Convert bare URLs: http://..., https://..., or indiankanoon.org/doc/...
        var bareUrlRegex = /(?<!href=")(https?:\/\/[^\s<>\)\]]+|(?<!\/)\b(?:www\.)?indiankanoon\.org\/[^\s<>\)\]]+)/gi;
        processed = processed.replace(bareUrlRegex, function(match) {
            var fullUrl = match.startsWith('http') ? match : ('https://' + match);
            return '<a href="' + fullUrl + '" target="_blank" style="color: #2563eb; text-decoration: underline; font-weight: 500;">' + match + '</a>';
        });

        return processed;
    }

    function formatCaseNamesInHtml(escapedText) {
        var caseRegex = /\b([A-Z][A-Za-z0-9.&'/-]*(?:\s+[A-Z][A-Za-z0-9.&'/-]*)*)\s+(?:vs\.?|v\.?)\s+([A-Z][A-Za-z0-9.&'/-]*(?:\s+[A-Z][A-Za-z0-9.&'/-]*)*)\b|\bIn\s+re\s+([A-Z][A-Za-z0-9.&'/-]*(?:\s+[A-Z][A-Za-z0-9.&'/-]*)*)\b/g;
        return escapedText.replace(caseRegex, function(match) {
            return '<em style="font-style: italic; font-weight: 600;">' + match + '</em>';
        });
    }

    function formatLegalDocumentHtml(text) {
        if (!text || !String(text).trim()) return '';

        var lines = String(text).split(/\r?\n/);
        var htmlBlocks = [];

        lines.forEach(function(rawLine) {
            var line = String(rawLine || '').trim();
            if (!line) {
                htmlBlocks.push('<p style="font-family: \'Times New Roman\', Times, serif; font-size: 11pt; line-height: 1.5; margin: 0; padding: 0; min-height: 11pt;">&nbsp;</p>');
                return;
            }

            var escaped = escapeXml(line);
            var isMainTitle = /^(IN THE|SUPREME COURT|HIGH COURT|BEFORE THE|PETITION|MEMORANDUM|DEED|AGREEMENT|SPECIAL LEAVE|RECORD OF PROCEEDINGS)\b/i.test(line);

            if (isMainTitle) {
                htmlBlocks.push(
                    '<p style="font-family: \'Times New Roman\', Times, serif; font-size: 14pt; font-weight: bold; color: #000000; margin-top: 10pt; margin-bottom: 4pt; text-align: center; line-height: 1.3;">' +
                    convertUrlsToLinksInHtml(escaped) +
                    '</p>'
                );
            } else if (isHeadingLine(line)) {
                htmlBlocks.push(
                    '<p style="font-family: \'Times New Roman\', Times, serif; font-size: 12pt; font-weight: bold; color: #000000; margin-top: 8pt; margin-bottom: 3pt; text-align: left; line-height: 1.3;">' +
                    convertUrlsToLinksInHtml(escaped) +
                    '</p>'
                );
            } else {
                htmlBlocks.push(
                    '<p style="font-family: \'Times New Roman\', Times, serif; font-size: 11pt; line-height: 1.5; color: #111827; margin-top: 0pt; margin-bottom: 4pt; text-align: justify; word-wrap: break-word;">' +
                    convertUrlsToLinksInHtml(formatCaseNamesInHtml(escaped)) +
                    '</p>'
                );
            }
        });

        return '<div style="font-family: \'Times New Roman\', Times, serif; font-size: 11pt; line-height: 1.5; color: #111827; width: 100%; box-sizing: border-box; margin: 0; padding: 0;">\n' + htmlBlocks.join('\n') + '\n</div>';
    }

    function resetAllParagraphRightIndents() {
        try {
            window.Asc.plugin.callCommand(function() {
                var oDocument = Api.GetDocument();
                if (!oDocument) return;
                var aParagraphs = oDocument.GetAllParagraphs();
                if (aParagraphs && aParagraphs.length) {
                    for (var i = 0; i < aParagraphs.length; i++) {
                        try {
                            if (aParagraphs[i]) {
                                aParagraphs[i].SetIndRight(0);
                            }
                        } catch (e) {}
                    }
                }
            }, false);
        } catch (err) {
            console.warn('[ONLYOFFICE Plugin] resetAllParagraphRightIndents failed:', err);
        }
    }

    function scheduleIndentReset() {
        resetAllParagraphRightIndents();
        setTimeout(resetAllParagraphRightIndents, 150);
        setTimeout(resetAllParagraphRightIndents, 400);
        setTimeout(resetAllParagraphRightIndents, 800);
    }

    function detectCourtPresetFromText(text) {
        var sample = String(text || '').slice(0, 4000).toUpperCase();

        // Legal standard configuration matching Indian High Courts & District Courts
        return {
            id: 'indian_court_legal',
            name: 'Indian Court Legal Standard (Legal 8.5x14")',
            paper: 'Legal',
            widthDxa: 12240,       // 8.5 inches
            heightDxa: 20160,      // 14.0 inches
            fontFamily: 'Times New Roman',
            bodyFontSize: 24,       // 12pt
            headingFontSize: 28,    // 14pt
            quoteFontSize: 23,      // 11.5pt
            lineSpacing: 360,       // 1.5 line spacing
            marginTopDxa: 1440,    // 1.0 inch
            marginBottomDxa: 1440, // 1.0 inch
            marginLeftDxa: 1800,   // 1.25 inches (extra binding padding)
            marginRightDxa: 1440,  // 1.0 inch
            firstLineIndentDxa: 720, // 0.5 inch indent for body paragraphs
            alignment: 'justify'
        };
    }

    function applyAutoFormat(courtPreset) {
        getSelectedText(function(selectedText) {
            var preset = courtPreset || detectCourtPresetFromText(selectedText);
            var cleaned = formatPlainText(selectedText);

            if (!cleaned.trim()) {
                postToParent({
                    type: 'ONLYOFFICE_AUTOFORMAT_DONE',
                    applied: false,
                    reason: 'empty-selection'
                });
                return;
            }

            suppressSelectionSyncUntil = Date.now() + 1500;
            lastSelectionSnapshot = '';

            try {
                window.Asc.scope.preset = preset;
                window.Asc.plugin.callCommand(function() {
                    var pConfig = Asc.scope.preset || {};
                    var oDocument = Api.GetDocument();
                    if (!oDocument) return;

                    try {
                        var oSection = oDocument.GetFinalSection();
                        if (oSection && pConfig.marginLeftDxa) {
                            // Set Legal 8.5" x 14" Page Size and 1.25" Left Binding Margin
                            oSection.SetPageSize(pConfig.widthDxa || 12240, pConfig.heightDxa || 20160);
                            oSection.SetPageMargins(
                                pConfig.marginLeftDxa || 1800, // Left: 1.25 in
                                pConfig.marginTopDxa || 1440,  // Top: 1.0 in
                                pConfig.marginRightDxa || 1440,// Right: 1.0 in
                                pConfig.marginBottomDxa || 1440// Bottom: 1.0 in
                            );
                        }
                    } catch(e) {}

                    var oRange = oDocument.GetRangeBySelect();
                    var aParagraphs = (oRange && typeof oRange.GetAllParagraphs === 'function') ? oRange.GetAllParagraphs() : oDocument.GetAllParagraphs();
                    if (!aParagraphs || !aParagraphs.length) {
                        aParagraphs = oDocument.GetAllParagraphs();
                    }

                    if (aParagraphs && aParagraphs.length) {
                        for (var i = 0; i < aParagraphs.length; i++) {
                            var p = aParagraphs[i];
                            if (p) {
                                try { p.SetIndRight(0); } catch(e) {}
                                try { p.SetIndLeft(0); } catch(e) {}
                                try { p.SetFontFamily(pConfig.fontFamily || "Times New Roman"); } catch(e) {}
                                try { p.SetSpacingAfter(120); } catch(e) {}

                                try {
                                    var text = (p.GetText() || "").trim();
                                    var isTitle = /^(IN THE|SUPREME COURT|HIGH COURT|BEFORE THE|RECORD OF PROCEEDINGS|CRIMINAL WRIT PETITION|CIVIL WRIT PETITION|PETITION UNDER|SUMMONS|NOTICE)\b/i.test(text);
                                    var isVs = /^v\.?$|^vs\.?$|^versus$/i.test(text);
                                    var isPartyLabel = /^(\.\.\.\s*)?(Petitioner|Respondent|Plaintiff|Defendant|Appellant|Appellee)s?\s*$/i.test(text);

                                    if (isTitle || isVs) {
                                        p.SetAlign("center");
                                        p.SetBold(true);
                                        p.SetIndFirstLine(0);
                                        p.SetFontSize(isTitle ? (pConfig.headingFontSize || 28) : 24); // 14pt for header, 12pt for vs
                                    } else if (isPartyLabel) {
                                        p.SetAlign("right");
                                        p.SetBold(true);
                                        p.SetIndFirstLine(0);
                                        p.SetFontSize(24); // 12pt
                                    } else if (text.length > 0 && text.length <= 70 && !/[.!?]$/.test(text) && text === text.toUpperCase()) {
                                        p.SetAlign("left");
                                        p.SetBold(true);
                                        p.SetIndFirstLine(0);
                                        p.SetFontSize(24); // 12pt
                                    } else {
                                        p.SetAlign(pConfig.alignment || "justify");
                                        p.SetBold(false);
                                        p.SetIndFirstLine(pConfig.firstLineIndentDxa || 720); // 0.5 inch indent for body paragraphs
                                        p.SetFontSize(pConfig.bodyFontSize || 24); // 12pt
                                    }
                                } catch(e) {}
                            }
                        }
                    }
                }, false);

                postToParent({
                    type: 'ONLYOFFICE_AUTOFORMAT_DONE',
                    applied: true
                });
            } catch (error) {
                console.warn('[ONLYOFFICE Plugin] Native court auto-format failed, falling back to PasteText:', error);
                try {
                    window.Asc.plugin.executeMethod('PasteText', [cleaned]);
                    scheduleIndentReset();
                    postToParent({
                        type: 'ONLYOFFICE_AUTOFORMAT_DONE',
                        applied: true
                    });
                } catch (fallbackErr) {
                    postToParent({
                        type: 'ONLYOFFICE_AUTOFORMAT_ERROR',
                        message: fallbackErr && fallbackErr.message ? fallbackErr.message : 'Auto format failed.'
                    });
                }
            }
        });
    }

    function requestEnhanceSelection() {
        getSelectedText(function(selectedText) {
            var cleaned = formatPlainText(selectedText);
            postToParent({
                type: 'ONLYOFFICE_ENHANCE_SELECTION',
                text: cleaned || ''
            });
        });
    }

    function detectVariablesFromDocument() {
        try {
            window.Asc.plugin.callCommand(function() {
                var oDocument = Api.GetDocument();
                var foundVars = [];
                var ignoreSet = {
                    'THE': 1, 'AND': 1, 'FOR': 1, 'THAT': 1, 'THIS': 1, 'WITH': 1, 'FROM': 1,
                    'SHALL': 1, 'BEING': 1, 'UNDER': 1, 'UPON': 1, 'SAID': 1, 'HERETO': 1,
                    'OTHER': 1, 'COURT': 1, 'HIGH': 1, 'INDIA': 1, 'ACT': 1, 'SECTION': 1
                };

                // 1. Scan Content Controls by tag
                var aControls = oDocument.GetAllContentControls();
                if (aControls && aControls.length > 0) {
                    for (var i = 0; i < aControls.length; i++) {
                        var tag = aControls[i].GetTag();
                        if (tag && tag.trim() && foundVars.indexOf(tag.trim()) === -1) {
                            foundVars.push(tag.trim());
                        }
                    }
                }

                // 2. Scan Document Text for ALL_CAPS placeholders / bracketed tags
                var docText = oDocument.GetText();
                if (docText) {
                    var regex = /\[([A-Z0-9_]{2,40})\]|\{([A-Z0-9_]{2,40})\}|\b([A-Z0-9_]{3,35})\b/g;
                    var match;
                    while ((match = regex.exec(docText)) !== null) {
                        var v = (match[1] || match[2] || match[3] || '').trim();
                        if (v && v.length >= 3 && !ignoreSet[v] && foundVars.indexOf(v) === -1) {
                            if (/^[A-Z0-9_]+$/.test(v)) {
                                foundVars.push(v);
                            }
                        }
                    }
                }
                return foundVars;
            }, false, true, function(result) {
                if (Array.isArray(result) && result.length > 0) {
                    postToParent({
                        type: 'ONLYOFFICE_VARIABLES_DETECTED',
                        variables: result
                    });
                }
            });
        } catch (e) {
            console.warn('[ONLYOFFICE Plugin] Variable detection failed:', e);
        }
    }

    function navigateToVariableInDocument(tagToFind) {
        if (!tagToFind) return;
        try {
            window.Asc.scope.targetTag = tagToFind;
            window.Asc.plugin.callCommand(function() {
                var oDocument = Api.GetDocument();
                var target = Asc.scope.targetTag;
                if (!target) return;

                // 1. Try content control by tag
                var aContentControls = oDocument.GetContentControlsByTag(target);
                if (aContentControls && aContentControls.length > 0) {
                    aContentControls[0].GetRange().Select();
                    return;
                }

                // 2. Try exact search for tag or [tag] or {tag}
                var aSearch = oDocument.Search(target, false);
                if (aSearch && aSearch.length > 0) {
                    aSearch[0].Select();
                    return;
                }

                var bracketSearch = oDocument.Search('[' + target + ']', false);
                if (bracketSearch && bracketSearch.length > 0) {
                    bracketSearch[0].Select();
                }
            }, false);
        } catch (e) {
            console.warn('[ONLYOFFICE Plugin] Navigate to variable failed:', e);
        }
    }

    window.Asc.plugin.init = function() {
        postToParent({ type: 'ONLYOFFICE_PLUGIN_READY' });
        startSelectionWatcher();
        setTimeout(function() {
            detectVariablesFromDocument();
        }, 1200);
    };

    window.Asc.plugin.button = function(id) {
        stopSelectionWatcher();
        this.executeCommand('close', '');
    };

    window.addEventListener('message', function(event) {
        if (!event.data) return;

        if (event.data.type === 'ONLYOFFICE_GET_SELECTION') {
            getSelectedText(function(text) {
                postToParent({
                    type: 'ONLYOFFICE_SELECTION',
                    text: text || ''
                });
            });
        } else if (event.data.type === 'ONLYOFFICE_POLL_SELECTION') {
            getSelectedText(function(text) {
                postToParent({
                    type: 'ONLYOFFICE_SELECTION_STATE',
                    text: text || '',
                    hasSelection: !!String(text || '').trim()
                });
            });
        } else if (event.data.type === 'ONLYOFFICE_INSERT_HTML') {
            var rawHtml = String(event.data.html || '');
            console.log('[ONLYOFFICE Plugin] Received ONLYOFFICE_INSERT_HTML payload (length: ' + rawHtml.length + ')');
            try {
                window.Asc.plugin.executeMethod('PasteHtml', [rawHtml]);
                scheduleIndentReset();
                console.log('[ONLYOFFICE Plugin] PasteHtml executed successfully.');
            } catch (err) {
                console.error('[ONLYOFFICE Plugin] PasteHtml execution failed:', err);
            }
        } else if (event.data.type === 'ONLYOFFICE_REPLACE_SELECTION_HTML') {
            // PasteHtml already replaces the active selection — same API, clearer intent
            var replaceHtml = String(event.data.html || '');
            console.log('[ONLYOFFICE Plugin] ONLYOFFICE_REPLACE_SELECTION_HTML (length: ' + replaceHtml.length + ')');
            try {
                window.Asc.plugin.executeMethod('PasteHtml', [replaceHtml]);
                scheduleIndentReset();
                console.log('[ONLYOFFICE Plugin] Replace-selection PasteHtml executed successfully.');
            } catch (err) {
                console.error('[ONLYOFFICE Plugin] Replace-selection PasteHtml failed:', err);
                // Fallback: try plain text strip of HTML
                try {
                    var tmp = replaceHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    window.Asc.plugin.executeMethod('PasteText', [tmp]);
                    scheduleIndentReset();
                } catch (e2) {}
            }
        } else if (event.data.type === 'ONLYOFFICE_INSERT_TEXT') {
            var rawText = String(event.data.text || '');
            var formattedHtml = formatLegalDocumentHtml(rawText);
            try {
                if (formattedHtml) {
                    window.Asc.plugin.executeMethod('PasteHtml', [formattedHtml]);
                } else {
                    window.Asc.plugin.executeMethod('PasteText', [rawText]);
                }
                scheduleIndentReset();
            } catch (err) {
                console.warn('[ONLYOFFICE Plugin] PasteHtml failed in ONLYOFFICE_INSERT_TEXT, falling back to PasteText:', err);
                try {
                    window.Asc.plugin.executeMethod('PasteText', [rawText]);
                    scheduleIndentReset();
                } catch (e) {}
            }
        } else if (event.data.type === 'ONLYOFFICE_AUTO_FORMAT_SELECTION') {
            applyAutoFormat(event.data.courtPreset || event.data.preset);
        } else if (event.data.type === 'ONLYOFFICE_ENHANCE_WITH_AI') {
            requestEnhanceSelection();
        } else if (event.data.type === 'ONLYOFFICE_DETECT_VARIABLES') {
            detectVariablesFromDocument();
        } else if (event.data.type === 'ONLYOFFICE_NAVIGATE_TO_VARIABLE') {
            navigateToVariableInDocument(event.data.tag);
        }
    });
})(window, undefined);
