const map = L.map('map').setView([55.751244, 37.618423], 6);
let currentSheetLayer = null;
let gridLayer = L.layerGroup().addTo(map);
let markerLayer = L.layerGroup().addTo(map);
let activeParent = null;

let historyStack = [];
const MAX_HISTORY = 50;

const errorEl = document.getElementById('error-message');
const backBtn = document.getElementById('back-btn');
const nextScalePanel = document.getElementById('next-scale-panel');
const nextScaleButtons = document.getElementById('next-scale-buttons');
const closeScalePanelBtn = document.getElementById('close-scale-panel');
const ambiguousModal = document.getElementById('ambiguous-scale-modal');
const modalOverlay = document.getElementById('modal-overlay');
const modalMessage = document.getElementById('modal-message');
const selectOption1 = document.getElementById('select-option1');
const selectOption2 = document.getElementById('select-option2');
const exportBtn = document.getElementById('export-geojson-btn');

let pendingNomenclature = null;
let pendingAmbiguityType = null;

function showError(text) {
    errorEl.textContent = text;
    errorEl.style.display = 'block';
}
function hideError() {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
}

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

const nextScaleOptions = {
    '1M':   ['500k', '300k', '200k', '100k'],
    '100k': ['50k', '5k'],
    '50k':  ['25k'],
    '25k':  ['10k'],
    '10k':  [],
    '5k':   ['2k'],
    '2k':   [],
    '500k': [],
    '300k': [],
    '200k': []
};

const divisions = {
    '500k': { rows: 2,  cols: 2,   labels: (i, j) => ['А', 'Б', 'В', 'Г'][i * 2 + j] },
    '300k': { rows: 3,  cols: 3,   labels: (i, j) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][i * 3 + j] },
    '200k': { rows: 6,  cols: 6,   labels: (i, j) => {
        const num = i * 6 + j + 1;
        return arabicToRoman(num);
    }},
    '100k': { rows: 12, cols: 12,  labels: (i, j) => (i * 12 + j + 1).toString() },
    '50k':  { rows: 2,  cols: 2,   labels: (i, j) => ['А', 'Б', 'В', 'Г'][i * 2 + j] },
    '25k':  { rows: 2,  cols: 2,   labels: (i, j) => ['а', 'б', 'в', 'г'][i * 2 + j] },
    '10k':  { rows: 2,  cols: 2,   labels: (i, j) => (i * 2 + j + 1).toString() },
    '5k':   { rows: 16, cols: 16,  labels: (i, j) => (i * 16 + j + 1).toString() },
    '2k':   { rows: 3,  cols: 3,   labels: (i, j) => ['а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и'][i * 3 + j] }
};

function arabicToRoman(num) {
    if (num < 1 || num > 36) return '';
    const digits = [
        ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'],
        ['', 'X', 'XX', 'XXX']
    ];
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return digits[1][tens] + digits[0][ones];
}

function isSouthern(nomenclature) {
    return nomenclature.includes('(Ю.П.)') || nomenclature.includes('(ю.п.)');
}
function cleanNomenclature(nom) {
    return nom.replace(/\s*\(Ю\.П\.\)\s*/i, '').trim();
}

function checkAmbiguity(nomenclature) {
    const cleaned = cleanNomenclature(nomenclature);
    const parts = cleaned.split('-');
    if (parts.length < 2) return null;

    if (parts.length >= 2 && /^[IVX]+$/i.test(parts[0]) && /^[A-Z]-\d+/.test(parts.slice(1).join('-'))) {
        return 'roman-prefix';
    }

    if (parts.length === 3) {
        const lastPart = parts[2];
        if (/^[IVX]+$/i.test(lastPart)) {
            const romanValues = { 'I':1, 'II':2, 'III':3, 'IV':4, 'V':5, 'VI':6, 'VII':7, 'VIII':8, 'IX':9 };
            if (romanValues.hasOwnProperty(lastPart.toUpperCase())) {
                return 'roman';
            }
        }
    }
    return null;
}

function parseMillionPart(millionStr) {
    if (/^Z$/i.test(millionStr)) {
        return { row: 'Z', cols: [1], isSpecial: 'Z' };
    }

    const match = millionStr.match(/^([A-Va-v])-(\d+(?:,\d+)*)$/i);
    if (!match) {
        throw new Error(`Неверный формат миллионного листа: ${millionStr}`);
    }

    const rowLetter = match[1].toUpperCase();
    const colNumbers = match[2].split(',').map(n => parseInt(n.trim(), 10));

    if (rowLetter < 'A' || rowLetter > 'V') throw new Error(`Недопустимый ряд: ${rowLetter}`);
    for (let col of colNumbers) {
        if (col < 1 || col > 60) throw new Error(`Недопустимая колонна: ${col}`);
    }

    let type = 'single';
    if (colNumbers.length === 2) type = 'double';
    else if (colNumbers.length === 4) type = 'quadruple';

    return { row: rowLetter, cols: colNumbers, type };
}

function buildScaleSequence(extraParts, forcedScale = null) {
    const scaleSequence = [];
    for (let i = 0; i < extraParts.length; i++) {
        let part = extraParts[i];
        const purePart = part.split(',')[0].trim();

        if (/^\d+$/.test(purePart) && parseInt(purePart) >= 1 && parseInt(purePart) <= 144) {
            if (i === 0 && extraParts.length === 1) {
                scaleSequence.push('100k');
            } else {
                const prev = extraParts[i-1];
                if (prev && /^[абвг]$/.test(prev)) {
                    scaleSequence.push('10k');
                } else {
                    scaleSequence.push('100k');
                }
            }
        } else if (/^[АБВГ]$/.test(purePart)) {
            if (i === 0 && extraParts.length === 1) {
                scaleSequence.push('500k');
            } else {
                scaleSequence.push('50k');
            }
        } else if (/^[абвг]$/.test(purePart)) {
            scaleSequence.push('25k');
        } else if (/^[IVX]+$/i.test(purePart)) {
            scaleSequence.push(forcedScale === '300k' ? '300k' : '200k');
        } else if (/^[IVXLCDM]+$/i.test(purePart)) {
            scaleSequence.push('200k');
        }
    }
    return scaleSequence;
}

function getScaleFromNomenclature(nom, forcedScale = null) {
    const cleaned = cleanNomenclature(nom);
    if (/^Z$/i.test(cleaned)) return '1M';

    const parts = cleaned.split('-');
    if (parts.length >= 2 && /^[IVX]+$/i.test(parts[0])) {
        return '300k';
    }

    let baseNom = cleaned;
    const bracketMatch = cleaned.match(/^(.+?)\(([^)]+)\)$/);
    if (bracketMatch) {
        baseNom = bracketMatch[1].trim();
        const bracketPart = bracketMatch[2].trim();
        if (bracketPart.includes('-')) return '2k';
        else return '5k';
    }

    const baseParts = baseNom.split('-');
    if (baseParts.length === 1) return '1M';

    const millionCandidate = baseParts[0] + '-' + baseParts[1];
    if (/^[A-Z]-\d+(,\d+)*$/.test(millionCandidate)) {
        if (baseParts.length === 2) return '1M';
        const extraParts = baseParts.slice(2);
        const scaleSeq = buildScaleSequence(extraParts, forcedScale);
        return scaleSeq.length > 0 ? scaleSeq[scaleSeq.length - 1] : '1M';
    }

    return '1M';
}

function nomenclatureToBounds(nomenclature, forcedScale = null) {
    let nom = nomenclature.trim();
    const southern = isSouthern(nom);
    nom = cleanNomenclature(nom);

    if (/^Z$/i.test(nom)) {
        if (southern) throw new Error('Лист Z не существует в южном полушарии');
        return L.latLngBounds(L.latLng(88, -180), L.latLng(90, 180));
    }

    let prefixRoman = null;
    const parts = nom.split('-');
    if (parts.length >= 2 && /^[IVX]+$/i.test(parts[0])) {
        prefixRoman = parts[0].toUpperCase();
        nom = parts.slice(1).join('-');
    }

    let baseNom = nom;
    let bracketPart = '';
    const bracketMatch = nom.match(/^(.+?)\(([^)]+)\)$/);
    if (bracketMatch) {
        baseNom = bracketMatch[1].trim();
        bracketPart = bracketMatch[2].trim();
    }

    const baseParts = baseNom.split('-');
    let millionPart, extraParts = [];

    if (baseParts.length === 1) {
        millionPart = baseParts[0] + '-1';
    } else {
        millionPart = baseParts[0] + '-' + baseParts[1];
        extraParts = baseParts.slice(2);
    }

    const millionInfo = parseMillionPart(millionPart);

    const rowIndex = millionInfo.row.charCodeAt(0) - 'A'.charCodeAt(0);
    let latSouth, latNorth;
    if (southern) {
        latSouth = - (rowIndex + 1) * 4;
        latNorth = - rowIndex * 4;
    } else {
        latSouth = rowIndex * 4;
        latNorth = (rowIndex + 1) * 4;
    }

    let lonWest, lonEast;
    if (millionInfo.type === 'single') {
        const col = millionInfo.cols[0];
        lonWest = -180 + (col - 1) * 6;
        lonEast = lonWest + 6;
    } else if (millionInfo.type === 'double') {
        const col1 = millionInfo.cols[0];
        const col2 = millionInfo.cols[1];
        if (col2 !== col1 + 1) throw new Error(`Неверные колонки для сдвоенного листа: ${millionInfo.cols.join(',')}`);
        lonWest = -180 + (col1 - 1) * 6;
        lonEast = lonWest + 12;
    } else if (millionInfo.type === 'quadruple') {
        const col1 = millionInfo.cols[0];
        const col4 = millionInfo.cols[3];
        if (col4 !== col1 + 3) throw new Error(`Неверные колонки для счетверённого листа: ${millionInfo.cols.join(',')}`);
        lonWest = -180 + (col1 - 1) * 6;
        lonEast = lonWest + 24;
    }

    const absLat = Math.abs(latSouth);
    if (absLat >= 60 && absLat < 76) {
        if (millionInfo.type === 'double') {
            const col = millionInfo.cols[0];
            if (col % 2 !== 0) {
                lonEast = lonWest + 12;
            } else {
                throw new Error(`Сдвоенный лист должен начинаться с нечётной колонки`);
            }
        }
    } else if (absLat >= 76 && absLat < 88) {
        if (millionInfo.type === 'quadruple') {
            const col = millionInfo.cols[0];
            if ((col - 1) % 4 === 0) {
                lonEast = lonWest + 24;
            } else {
                throw new Error(`Счетверённый лист должен начинаться с колонки вида 1,5,9...`);
            }
        }
    }

    let currentBounds = L.latLngBounds(L.latLng(latSouth, lonWest), L.latLng(latNorth, lonEast));

    if (prefixRoman) {
        const div = divisions['300k'];
        const labels = [];
        for (let r = 0; r < div.rows; r++) {
            for (let c = 0; c < div.cols; c++) {
                labels.push(div.labels(r, c));
            }
        }
        const idx = labels.indexOf(prefixRoman);
        if (idx === -1) throw new Error(`Неверная римская цифра для 1:300 000: ${prefixRoman}`);
        const row = Math.floor(idx / div.cols);
        const col = idx % div.cols;
        const latStep = (currentBounds.getNorth() - currentBounds.getSouth()) / div.rows;
        const lngStep = (currentBounds.getEast() - currentBounds.getWest()) / div.cols;
        const sheetNorth = currentBounds.getNorth() - row * latStep;
        const sheetSouth = sheetNorth - latStep;
        const sheetWest = currentBounds.getWest() + col * lngStep;
        const sheetEast = sheetWest + lngStep;
        currentBounds = L.latLngBounds(L.latLng(sheetSouth, sheetWest), L.latLng(sheetNorth, sheetEast));
    }

    const scaleSequence = buildScaleSequence(extraParts, forcedScale);

    for (let i = 0; i < scaleSequence.length; i++) {
        const scale = scaleSequence[i];
        let part = extraParts[i];
        const div = divisions[scale];
        if (!div) continue;

        let isComposite = false;
        let subParts = [];
        if (typeof part === 'string' && part.includes(',')) {
            isComposite = true;
            subParts = part.split(',').map(p => p.trim());
            part = subParts[0];
        }

        const labels = [];
        for (let r = 0; r < div.rows; r++) {
            for (let c = 0; c < div.cols; c++) {
                labels.push(div.labels(r, c));
            }
        }
        const idx = labels.indexOf(part);
        if (idx === -1) {
            console.warn(`Не найдена метка "${part}" для масштаба ${scale}`);
            continue;
        }
        const row = Math.floor(idx / div.cols);
        const col = idx % div.cols;

        const latStep = (currentBounds.getNorth() - currentBounds.getSouth()) / div.rows;
        let lngStep = (currentBounds.getEast() - currentBounds.getWest()) / div.cols;

        const sheetNorth = currentBounds.getNorth() - row * latStep;
        const sheetSouth = sheetNorth - latStep;
        let sheetWest = currentBounds.getWest() + col * lngStep;
        let sheetEast = sheetWest + lngStep;

        if (isComposite) {
            const count = subParts.length;
            sheetEast = sheetWest + lngStep * count;
        }

        currentBounds = L.latLngBounds(
            L.latLng(sheetSouth, sheetWest),
            L.latLng(sheetNorth, sheetEast)
        );
    }

    if (bracketPart) {
        const bracketSubParts = bracketPart.split('-').map(s => s.trim());
        const numberPart = bracketSubParts[0];
        const letterPart = bracketSubParts.length > 1 ? bracketSubParts[1] : null;

        const div5k = divisions['5k'];
        const labels5k = [];
        for (let r = 0; r < div5k.rows; r++) {
            for (let c = 0; c < div5k.cols; c++) {
                labels5k.push(div5k.labels(r, c));
            }
        }
        const idx5k = labels5k.indexOf(numberPart);
        if (idx5k === -1) throw new Error(`Неверный номер листа 1:5000: ${numberPart}`);
        const row5k = Math.floor(idx5k / div5k.cols);
        const col5k = idx5k % div5k.cols;
        const latStep5k = (currentBounds.getNorth() - currentBounds.getSouth()) / div5k.rows;
        const lngStep5k = (currentBounds.getEast() - currentBounds.getWest()) / div5k.cols;
        const north5k = currentBounds.getNorth() - row5k * latStep5k;
        const south5k = north5k - latStep5k;
        const west5k = currentBounds.getWest() + col5k * lngStep5k;
        const east5k = west5k + lngStep5k;
        currentBounds = L.latLngBounds(L.latLng(south5k, west5k), L.latLng(north5k, east5k));

        if (letterPart) {
            const div2k = divisions['2k'];
            const labels2k = [];
            for (let r = 0; r < div2k.rows; r++) {
                for (let c = 0; c < div2k.cols; c++) {
                    labels2k.push(div2k.labels(r, c));
                }
            }
            const idx2k = labels2k.indexOf(letterPart);
            if (idx2k === -1) throw new Error(`Неверная литера листа 1:2000: ${letterPart}`);
            const row2k = Math.floor(idx2k / div2k.cols);
            const col2k = idx2k % div2k.cols;
            const latStep2k = (currentBounds.getNorth() - currentBounds.getSouth()) / div2k.rows;
            const lngStep2k = (currentBounds.getEast() - currentBounds.getWest()) / div2k.cols;
            const north2k = currentBounds.getNorth() - row2k * latStep2k;
            const south2k = north2k - latStep2k;
            const west2k = currentBounds.getWest() + col2k * lngStep2k;
            const east2k = west2k + lngStep2k;
            currentBounds = L.latLngBounds(L.latLng(south2k, west2k), L.latLng(north2k, east2k));
        }
    }

    return currentBounds;
}

function generateSheetsInside(parentBounds, parentNom, targetScale) {
    const sheets = [];
    const div = divisions[targetScale];
    if (!div) return sheets;

    const southern = isSouthern(parentNom);
    let cleanParent = cleanNomenclature(parentNom);

    const south = parentBounds.getSouth();
    const west = parentBounds.getWest();
    const north = parentBounds.getNorth();
    const east = parentBounds.getEast();

    const latStep = (north - south) / div.rows;
    const lngStep = (east - west) / div.cols;

    for (let i = 0; i < div.rows; i++) {
        const rowNorth = north - i * latStep;
        const rowSouth = rowNorth - latStep;
        for (let j = 0; j < div.cols; j++) {
            let sheetWest = west + j * lngStep;
            let sheetEast = sheetWest + lngStep;

            const centerLat = (rowNorth + rowSouth) / 2;
            const absLat = Math.abs(centerLat);
            let suffix;

            if (targetScale === '500k' || targetScale === '200k' || targetScale === '100k') {
                if (absLat >= 60 && absLat < 76) {
                    if (targetScale === '500k') {
                        suffix = div.labels(i, j);
                    } else {
                        if (j % 2 === 0) {
                            sheetEast = sheetWest + 2 * lngStep;
                            const label1 = div.labels(i, j);
                            const label2 = div.labels(i, j + 1);
                            suffix = `${label1},${label2}`;
                            j++;
                        } else {
                            continue;
                        }
                    }
                } else if (absLat >= 76 && absLat < 88) {
                    if (targetScale === '200k') {
                        if (j % 3 === 0) {
                            sheetEast = sheetWest + 3 * lngStep;
                            const labels = [];
                            for (let k = 0; k < 3; k++) {
                                labels.push(div.labels(i, j + k));
                            }
                            suffix = labels.join(',');
                            j += 2;
                        } else {
                            continue;
                        }
                    } else if (targetScale === '100k') {
                        if (j === 0) {
                            sheetEast = east;
                            const labels = [];
                            for (let k = 0; k < 4; k++) {
                                labels.push(div.labels(i, k));
                            }
                            suffix = labels.join(',');
                            j = div.cols;
                        } else {
                            continue;
                        }
                    } else if (targetScale === '500k') {
                        if (j === 0) {
                            sheetEast = west + 2 * lngStep;
                            const label1 = div.labels(i, 0);
                            const label2 = div.labels(i, 1);
                            suffix = `${label1},${label2}`;
                            j = 1;
                        } else if (j === 2) {
                            sheetWest = west + 2 * lngStep;
                            sheetEast = east;
                            const label1 = div.labels(i, 2);
                            const label2 = div.labels(i, 3);
                            suffix = `${label1},${label2}`;
                            j = div.cols;
                        } else {
                            continue;
                        }
                    }
                } else {
                    suffix = div.labels(i, j);
                }
            } else {
                suffix = div.labels(i, j);
            }

            const sheetBounds = L.latLngBounds(
                L.latLng(rowSouth, sheetWest),
                L.latLng(rowNorth, sheetEast)
            );

            let nomenclature;
            if (targetScale === '5k') {
                nomenclature = `${cleanParent}(${suffix})`;
            } else if (targetScale === '2k') {
                const match = cleanParent.match(/^(.*)\((\d+)\)$/);
                if (match) {
                    nomenclature = `${match[1]}(${match[2]}-${suffix})`;
                } else {
                    nomenclature = `${cleanParent}(${suffix})`;
                }
            } else if (targetScale === '300k') {
                nomenclature = `${suffix}-${cleanParent}`;
            } else {
                nomenclature = `${cleanParent}-${suffix}`;
            }

            if (southern && !nomenclature.includes('(Ю.П.)')) {
                nomenclature += ' (Ю.П.)';
            }

            sheets.push({ bounds: sheetBounds, nomenclature });
        }
    }
    return sheets;
}

function splitCompositeSheet(nomenclature, bounds, scale) {
    const cleaned = cleanNomenclature(nomenclature);
    const southern = isSouthern(nomenclature);
    let subParts;
    let count;

    if (scale === '1M') {
        const parts = cleaned.split('-');
        if (parts.length < 2) return [];
        const millionInfo = parseMillionPart(parts[0] + '-' + parts[1]);
        if (millionInfo.type === 'double') {
            subParts = millionInfo.cols;
            count = 2;
        } else if (millionInfo.type === 'quadruple') {
            subParts = millionInfo.cols;
            count = 4;
        } else {
            return [];
        }
    } else {
        const parts = cleaned.split('-');
        const lastPart = parts[parts.length - 1];
        if (!lastPart.includes(',')) return [];
        subParts = lastPart.split(',').map(p => p.trim());
        count = subParts.length;
    }

    const lonStep = (bounds.getEast() - bounds.getWest()) / count;
    const sheets = [];
    const baseParts = cleanNomenclature(nomenclature).split('-');

    for (let idx = 0; idx < count; idx++) {
        const sheetWest = bounds.getWest() + idx * lonStep;
        const sheetEast = sheetWest + lonStep;
        const sheetBounds = L.latLngBounds(
            L.latLng(bounds.getSouth(), sheetWest),
            L.latLng(bounds.getNorth(), sheetEast)
        );

        let singleNom;
        if (scale === '1M') {
            singleNom = `${baseParts[0]}-${subParts[idx]}`;
        } else {
            const newParts = baseParts.slice();
            newParts[newParts.length - 1] = subParts[idx];
            singleNom = newParts.join('-');
        }
        if (southern && !singleNom.includes('(Ю.П.)')) {
            singleNom += ' (Ю.П.)';
        }

        sheets.push({ bounds: sheetBounds, nomenclature: singleNom });
    }
    return sheets;
}

function isCompositeSheet(nomenclature, scale) {
    const cleaned = cleanNomenclature(nomenclature);
    if (scale === '1M') {
        const parts = cleaned.split('-');
        if (parts.length >= 2) {
            try {
                const info = parseMillionPart(parts[0] + '-' + parts[1]);
                return info.type === 'double' || info.type === 'quadruple';
            } catch (e) {
                return false;
            }
        }
        return false;
    }
    const lastPart = cleaned.split('-').pop();
    return lastPart && lastPart.includes(',');
}

function updateGrid() {
    gridLayer.clearLayers();
    let sheets = [];

    if (!activeParent) {
        const viewBounds = map.getBounds();
        const south = Math.floor(viewBounds.getSouth() / 4) * 4;
        const north = viewBounds.getNorth();

        for (let lat = south; lat < north; lat += 4) {
            const absLat = Math.abs(lat);
            const southern = lat < 0;
            let lngStep, type;
            if (absLat >= 88) {
                if (!southern) {
                    const sheetBounds = L.latLngBounds(L.latLng(88, -180), L.latLng(90, 180));
                    sheets.push({ bounds: sheetBounds, nomenclature: 'Z' });
                }
                continue;
            } else if (absLat >= 76) {
                lngStep = 24;
                type = 'quadruple';
            } else if (absLat >= 60) {
                lngStep = 12;
                type = 'double';
            } else {
                lngStep = 6;
                type = 'single';
            }

            let west = Math.floor((viewBounds.getWest() + 180) / lngStep) * lngStep - 180;
            west = Math.max(west, -180);
            const east = Math.min(viewBounds.getEast(), 180);

            for (let lng = west; lng < east; lng += lngStep) {
                if (lng < -180 || lng >= 180) continue;

                const sheetBounds = L.latLngBounds(L.latLng(lat, lng), L.latLng(lat+4, lng+lngStep));
                const absRow = Math.floor(Math.abs(lat) / 4);
                let rowLetter, suffix = '';
                if (southern) {
                    rowLetter = String.fromCharCode('A'.charCodeAt(0) + absRow);
                    suffix = ' (Ю.П.)';
                } else {
                    rowLetter = String.fromCharCode('A'.charCodeAt(0) + absRow);
                }

                const startCol = Math.floor((lng + 180) / 6) + 1;
                let nomenclature;
                if (type === 'single') {
                    nomenclature = `${rowLetter}-${startCol}${suffix}`;
                } else if (type === 'double') {
                    const firstCol = (startCol % 2 === 0) ? startCol - 1 : startCol;
                    nomenclature = `${rowLetter}-${firstCol},${firstCol+1}${suffix}`;
                } else if (type === 'quadruple') {
                    let firstCol = startCol;
                    while ((firstCol - 1) % 4 !== 0) firstCol--;
                    nomenclature = `${rowLetter}-${firstCol},${firstCol+1},${firstCol+2},${firstCol+3}${suffix}`;
                }

                sheets.push({ bounds: sheetBounds, nomenclature });
            }
        }
        document.getElementById('current-scale').textContent = '1:1,000,000';
    } else {
        if (isCompositeSheet(activeParent.nomenclature, activeParent.scale)) {
            sheets = splitCompositeSheet(activeParent.nomenclature, activeParent.bounds, activeParent.scale);
        } else if (activeParent.nextScale) {
            sheets = generateSheetsInside(activeParent.bounds, activeParent.nomenclature, activeParent.nextScale);
        }
    }

    const currentZoom = map.getZoom();

    sheets.forEach(sheet => {
        const geojson = {
            type: 'Feature',
            properties: { nomenclature: sheet.nomenclature },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [sheet.bounds.getWest(), sheet.bounds.getSouth()],
                    [sheet.bounds.getEast(), sheet.bounds.getSouth()],
                    [sheet.bounds.getEast(), sheet.bounds.getNorth()],
                    [sheet.bounds.getWest(), sheet.bounds.getNorth()],
                    [sheet.bounds.getWest(), sheet.bounds.getSouth()]
                ]]
            }
        };

        const layer = L.geoJSON(geojson, {
            style: { color: '#1976d2', weight: 1, fillOpacity: 0 },
            onEachFeature: (feature, l) => {
                l.on('click', () => displaySheet(sheet.nomenclature));
                l.on('mouseover', () => l.setStyle({ weight: 3, fillOpacity: 0.1, fillColor: '#3b82f6' }));
                l.on('mouseout', () => l.setStyle({ weight: 1, fillOpacity: 0, fillColor: '#3b82f6' }));
            }
        }).addTo(gridLayer);

        let labelText = sheet.nomenclature;
        if (activeParent) {
            // Для 300k префиксная римская цифра — это первая часть до дефиса
            if (activeParent.nextScale === '300k' || (activeParent.scale === '1M' && activeParent.nextScale === '300k')) {
                labelText = sheet.nomenclature.split('-')[0];
            } else {
                labelText = sheet.nomenclature.split('-').pop();
            }
        }
        if (sheet.nomenclature.includes('(')) {
            const match = sheet.nomenclature.match(/\(([^)]+)\)/);
            if (match) labelText = match[1];
        }

        if (currentZoom >= 4) {
            layer.bindTooltip(labelText, {
                permanent: true,
                direction: 'center',
                className: 'sheet-label'
            });
        }
    });

    updateBackButtonState();
}

function proceedToNextScale(parentScale) {
    if (activeParent && isCompositeSheet(activeParent.nomenclature, activeParent.scale)) {
        nextScalePanel.style.display = 'none';
        return false;
    }

    const options = nextScaleOptions[parentScale] || [];

    if (options.length === 0) {
        nextScalePanel.style.display = 'none';
        return false;
    }

    if (options.length === 1) {
        if (activeParent) {
            activeParent.nextScale = options[0];
            updateGrid();
        }
        nextScalePanel.style.display = 'none';
        return true;
    }

    nextScaleButtons.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        const scaleNames = {
            '500k': '1:500 000', '300k': '1:300 000', '200k': '1:200 000',
            '100k': '1:100 000', '50k': '1:50 000', '5k': '1:5 000'
        };
        btn.textContent = scaleNames[opt] || opt;
        btn.addEventListener('click', () => {
            if (activeParent) {
                activeParent.nextScale = opt;
                updateGrid();
                nextScalePanel.style.display = 'none';
            }
        });
        nextScaleButtons.appendChild(btn);
    });
    nextScalePanel.style.display = 'block';
    return true;
}

function pushHistoryState(nomenclature, bounds, scale) {
    const last = historyStack[historyStack.length - 1];
    if (last && last.nomenclature === nomenclature && last.scale === scale) return;
    historyStack.push({ nomenclature, bounds, scale });
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    updateBackButtonState();
}

function goBack() {
    if (historyStack.length <= 1) return;
    historyStack.pop();
    const prev = historyStack[historyStack.length - 1];
    if (prev.nomenclature === null) {
        activeParent = null;
        if (currentSheetLayer) map.removeLayer(currentSheetLayer);
        currentSheetLayer = null;
        document.getElementById('current-nomenclature').textContent = '—';
        document.getElementById('bound-north').textContent = '—';
        document.getElementById('bound-south').textContent = '—';
        document.getElementById('bound-west').textContent = '—';
        document.getElementById('bound-east').textContent = '—';
        map.setView([55.751244, 37.618423], 6);
        nextScalePanel.style.display = 'none';
        exportBtn.disabled = true;
    } else {
        activeParent = { nomenclature: prev.nomenclature, bounds: prev.bounds, scale: prev.scale };
        if (currentSheetLayer) map.removeLayer(currentSheetLayer);
        const bounds = activeParent.bounds;
        if (bounds) {
            const geojson = {
                type: 'Feature',
                properties: { nomenclature: activeParent.nomenclature },
                geometry: { type: 'Polygon', coordinates: [[
                    [bounds.getWest(), bounds.getSouth()], [bounds.getEast(), bounds.getSouth()],
                    [bounds.getEast(), bounds.getNorth()], [bounds.getWest(), bounds.getNorth()],
                    [bounds.getWest(), bounds.getSouth()]
                ]] }
            };
            currentSheetLayer = L.geoJSON(geojson, {
                style: { color: '#d32f2f', weight: 3, fillOpacity: 0.1 }
            }).addTo(map);
            document.getElementById('current-nomenclature').textContent = activeParent.nomenclature;
            document.getElementById('bound-north').textContent = bounds.getNorth().toFixed(4) + '°';
            document.getElementById('bound-south').textContent = bounds.getSouth().toFixed(4) + '°';
            document.getElementById('bound-west').textContent = bounds.getWest().toFixed(4) + '°';
            document.getElementById('bound-east').textContent = bounds.getEast().toFixed(4) + '°';

            updateGrid();
            map.fitBounds(bounds, { padding: [50, 50] });

            const scaleTextMap = {
                '1M': '1:1,000,000', '500k': '1:500,000', '300k': '1:300,000', '200k': '1:200,000',
                '100k': '1:100,000', '50k': '1:50,000', '25k': '1:25,000',
                '10k': '1:10,000', '5k': '1:5,000', '2k': '1:2,000'
            };
            document.getElementById('current-scale').textContent = scaleTextMap[prev.scale] || prev.scale;

            proceedToNextScale(activeParent.scale);
            exportBtn.disabled = false;
        }
    }
    updateBackButtonState();
}

function updateBackButtonState() {
    if (backBtn) backBtn.disabled = historyStack.length <= 1;
}

function boundsToGeoJSON(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const nw = L.latLng(ne.lat, sw.lng);
    const se = L.latLng(sw.lat, ne.lng);

    const coordinates = [[
        [sw.lng, sw.lat],
        [se.lng, se.lat],
        [ne.lng, ne.lat],
        [nw.lng, nw.lat],
        [sw.lng, sw.lat]
    ]];

    return {
        type: "Feature",
        properties: {
            nomenclature: activeParent?.nomenclature || "",
            scale: document.getElementById('current-scale').textContent,
            area: (bounds.getNorth() - bounds.getSouth()) * (bounds.getEast() - bounds.getWest())
        },
        geometry: {
            type: "Polygon",
            coordinates: coordinates
        }
    };
}

function finalizeDisplaySheet(nomenclature, bounds, scale) {
    if (activeParent) {
        pushHistoryState(activeParent.nomenclature, activeParent.bounds, activeParent.scale);
    } else {
        pushHistoryState(null, null, null);
    }

    activeParent = { nomenclature, bounds, scale };

    if (currentSheetLayer) map.removeLayer(currentSheetLayer);
    const geojson = {
        type: 'Feature', properties: { nomenclature },
        geometry: { type: 'Polygon', coordinates: [[
            [bounds.getWest(), bounds.getSouth()], [bounds.getEast(), bounds.getSouth()],
            [bounds.getEast(), bounds.getNorth()], [bounds.getWest(), bounds.getNorth()],
            [bounds.getWest(), bounds.getSouth()]
        ]] }
    };
    currentSheetLayer = L.geoJSON(geojson, {
        style: { color: '#d32f2f', weight: 3, fillOpacity: 0.1 }
    }).addTo(map);

    document.getElementById('current-nomenclature').textContent = nomenclature;
    document.getElementById('bound-north').textContent = bounds.getNorth().toFixed(4) + '°';
    document.getElementById('bound-south').textContent = bounds.getSouth().toFixed(4) + '°';
    document.getElementById('bound-west').textContent = bounds.getWest().toFixed(4) + '°';
    document.getElementById('bound-east').textContent = bounds.getEast().toFixed(4) + '°';

    map.fitBounds(bounds, { padding: [50, 50] });

    gridLayer.clearLayers();
    const scaleTextMap = {
        '1M': '1:1,000,000', '500k': '1:500,000', '300k': '1:300,000', '200k': '1:200,000',
        '100k': '1:100,000', '50k': '1:50,000', '25k': '1:25,000',
        '10k': '1:10,000', '5k': '1:5,000', '2k': '1:2,000'
    };
    document.getElementById('current-scale').textContent = scaleTextMap[scale] || scale;

    proceedToNextScale(scale);
    if (isCompositeSheet(nomenclature, scale)) {
        nextScalePanel.style.display = 'none';
    }
    exportBtn.disabled = false;
}

function displaySheet(nomenclature) {
    try {
        hideError();

        const ambType = checkAmbiguity(nomenclature);
        if (ambType === 'roman') {
            pendingNomenclature = nomenclature;
            pendingAmbiguityType = ambType;
            modalMessage.textContent = 'Римская цифра может относиться к масштабу 1:300 000 или 1:200 000. Выберите нужный масштаб:';
            selectOption1.textContent = '1:300 000';
            selectOption2.textContent = '1:200 000';
            ambiguousModal.style.display = 'block';
            modalOverlay.style.display = 'block';
            return;
        }

        const bounds = nomenclatureToBounds(nomenclature);
        const scale = getScaleFromNomenclature(nomenclature);
        finalizeDisplaySheet(nomenclature, bounds, scale);
    } catch (e) {
        showError(e.message);
        console.error(e);
    }
}

function resolveAmbiguity(choice) {
    if (!pendingNomenclature) return;

    const forcedScale = (choice === 'option1') ? '300k' : '200k';

    try {
        const bounds = nomenclatureToBounds(pendingNomenclature, forcedScale);
        const scale = getScaleFromNomenclature(pendingNomenclature, forcedScale);
        finalizeDisplaySheet(pendingNomenclature, bounds, scale);
    } catch (e) {
        showError(e.message);
    }

    ambiguousModal.style.display = 'none';
    modalOverlay.style.display = 'none';
    pendingNomenclature = null;
    pendingAmbiguityType = null;
}

selectOption1.addEventListener('click', () => resolveAmbiguity('option1'));
selectOption2.addEventListener('click', () => resolveAmbiguity('option2'));
modalOverlay.addEventListener('click', () => {
    ambiguousModal.style.display = 'none';
    modalOverlay.style.display = 'none';
    pendingNomenclature = null;
});

function goToCoordinates(lat, lng) {
    if (isNaN(lat) || isNaN(lng)) throw new Error('Координаты должны быть числами');
    if (lat < -90 || lat > 90) throw new Error('Широта от -90 до 90');
    if (lng < -180 || lng > 180) throw new Error('Долгота от -180 до 180');

    markerLayer.clearLayers();
    L.marker([lat, lng]).addTo(markerLayer).bindPopup(`${lat.toFixed(5)}°, ${lng.toFixed(5)}°`).openPopup();
    map.setView([lat, lng], 10);

    const southern = lat < 0;
    const absLat = Math.abs(lat);
    const absRow = Math.floor(absLat / 4);
    let rowLetter, suffix = '';
    if (southern) {
        rowLetter = String.fromCharCode('A'.charCodeAt(0) + absRow);
        suffix = ' (Ю.П.)';
    } else {
        rowLetter = String.fromCharCode('A'.charCodeAt(0) + absRow);
    }

    let lngStep;
    if (absLat >= 88) {
        if (!southern) {
            displaySheet('Z');
        } else {
            showError('Лист Z не существует в южном полушарии');
        }
        return;
    } else if (absLat >= 76) {
        lngStep = 24;
    } else if (absLat >= 60) {
        lngStep = 12;
    } else {
        lngStep = 6;
    }

    let lngNormalized = lng;
    while (lngNormalized < -180) lngNormalized += 360;
    while (lngNormalized >= 180) lngNormalized -= 360;

    let startCol = Math.floor((lngNormalized + 180) / 6) + 1;
    let nomenclature;

    if (lngStep === 6) {
        nomenclature = `${rowLetter}-${startCol}${suffix}`;
    } else if (lngStep === 12) {
        const firstCol = (startCol % 2 === 0) ? startCol - 1 : startCol;
        nomenclature = `${rowLetter}-${firstCol},${firstCol+1}${suffix}`;
    } else if (lngStep === 24) {
        let firstCol = startCol;
        while ((firstCol - 1) % 4 !== 0) firstCol--;
        nomenclature = `${rowLetter}-${firstCol},${firstCol+1},${firstCol+2},${firstCol+3}${suffix}`;
    }

    displaySheet(nomenclature);
}

map.on('moveend', updateGrid);

document.getElementById('search-btn').addEventListener('click', () => {
    const val = document.getElementById('search-input').value.trim();
    val ? displaySheet(val) : showError('Введите номенклатуру');
});

document.getElementById('go-coords-btn').addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('lat-input').value);
    const lng = parseFloat(document.getElementById('lng-input').value);
    try { goToCoordinates(lat, lng); hideError(); } catch(e) { showError(e.message); }
});

if (backBtn) backBtn.addEventListener('click', goBack);
if (closeScalePanelBtn) {
    closeScalePanelBtn.addEventListener('click', () => {
        nextScalePanel.style.display = 'none';
    });
}

exportBtn.addEventListener('click', () => {
    if (!activeParent || !activeParent.bounds) return;

    const feature = boundsToGeoJSON(activeParent.bounds);
    const geojson = {
        type: "FeatureCollection",
        features: [feature]
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeParent.nomenclature.replace(/[^a-zA-Z0-9а-яА-Я-]/g, '_')}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

window.addEventListener('load', () => {
    historyStack = [{ nomenclature: null, bounds: null, scale: null }];
    updateGrid();
    hideError();
    updateBackButtonState();
    nextScalePanel.style.display = 'none';
    exportBtn.disabled = true;
});