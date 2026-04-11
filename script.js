// --- Глобальные переменные ---
const map = L.map('map').setView([55.751244, 37.618423], 8); // Москва
let currentSheetLayer = null;   // Слой с границами текущего листа
let gridLayer = L.layerGroup().addTo(map); // Слой для сетки разграфки
let currentBounds = null;       // Границы текущего листа

// --- Инициализация карты (подложка OSM) ---
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// --- Основные функции для работы с номенклатурой ---

/**
 * Преобразует номенклатуру листа в его географические границы.
 * @param {string} nomenclature - Строка вида "N-37-56-А-в-1"
 * @returns {L.LatLngBounds} Объект границ Leaflet
 */
function nomenclatureToBounds(nomenclature) {
    // Разбираем строку номенклатуры
    const parts = nomenclature.split('-');

    // 1. Базовый лист 1:1,000,000 (ряд и колонна)
    const millionPart = parts[0];
    const rowLetter = millionPart[0];
    const colNumber = parseInt(millionPart.slice(1), 10);

    // Определяем широту (ряды идут от A до V, каждая по 4°)
    const rowIndex = rowLetter.charCodeAt(0) - 'A'.charCodeAt(0);
    let latSouth = rowIndex * 4;
    let latNorth = (rowIndex + 1) * 4;

    // Определяем долготу (колонны нумеруются с 1 от 180° з.д.)
    let lonWest = -180 + (colNumber - 1) * 6;
    let lonEast = lonWest + 6;

    // --- Специальные случаи для приполярных областей (сдвоенные листы) ---
    if (rowLetter >= 'A' && rowLetter <= 'B') { // Южное полушарие (условно)
        // Для простоты оставим как есть, но можно добавить логику Ю.П.
    }
    if (rowIndex >= 15) { // 60° с.ш. и выше
        if (rowIndex === 15) { // 60-64°
            lonWest = -180 + (colNumber - 1) * 12;
            lonEast = lonWest + 12;
        } else if (rowIndex === 16) { // 64-68° и т.д.
            // Упрощенно, в реальности есть таблица сдвоенных листов
        }
    }

    let bounds = L.latLngBounds(
        L.latLng(latSouth, lonWest),
        L.latLng(latNorth, lonEast)
    );

    // 2. Обработка масштаба 1:500,000 (деление на 4 части А,Б,В,Г)
    if (parts.length > 1 && /^[АБВГ]$/.test(parts[1])) {
        const subIndex = parts[1];
        const latStep = (latNorth - latSouth) / 2;
        const lonStep = (lonEast - lonWest) / 2;

        const subMap = { 'А': [0, 0], 'Б': [0, 1], 'В': [1, 0], 'Г': [1, 1] };
        const [row, col] = subMap[subIndex];

        latSouth += row * latStep;
        latNorth = latSouth + latStep;
        lonWest += col * lonStep;
        lonEast = lonWest + lonStep;
        bounds = L.latLngBounds(L.latLng(latSouth, lonWest), L.latLng(latNorth, lonEast));
    }

    // 3. Обработка масштаба 1:200,000 (деление на 36 частей I-XXXVI)
    if (parts.length > 1 && /^[IVX]+$/.test(parts[1])) {
        // Функция для перевода римского числа в арабское (упрощенная)
        function romanToArabic(roman) {
            const r = { 'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100 };
            let num = 0;
            for (let i = 0; i < roman.length; i++) {
                const cur = r[roman[i]];
                const next = r[roman[i+1]];
                num += (cur < next) ? -cur : cur;
            }
            return num;
        }
        const num = romanToArabic(parts[1]); // 1..36
        const cols = 6;
        const rows = 6;
        const row = Math.floor((num - 1) / cols);
        const col = (num - 1) % cols;

        const latStep = (latNorth - latSouth) / rows;
        const lonStep = (lonEast - lonWest) / cols;

        latSouth += row * latStep;
        latNorth = latSouth + latStep;
        lonWest += col * lonStep;
        lonEast = lonWest + lonStep;
        bounds = L.latLngBounds(L.latLng(latSouth, lonWest), L.latLng(latNorth, lonEast));
    }

    // 4. Обработка масштаба 1:100,000 (деление на 144 части 1-144)
    if (parts.length > 1 && /^\d+$/.test(parts[1]) && !parts[1].includes('(')) {
        const num = parseInt(parts[1], 10);
        const cols = 12;
        const rows = 12;
        const row = Math.floor((num - 1) / cols);
        const col = (num - 1) % cols;

        const latStep = (latNorth - latSouth) / rows;
        const lonStep = (lonEast - lonWest) / cols;

        latSouth += row * latStep;
        latNorth = latSouth + latStep;
        lonWest += col * lonStep;
        lonEast = lonWest + lonStep;
        bounds = L.latLngBounds(L.latLng(latSouth, lonWest), L.latLng(latNorth, lonEast));
    }

    // 5. Обработка масштаба 1:50,000 (деление 1:100,000 на 4 части А,Б,В,Г)
    if (parts.length > 2 && /^[АБВГ]$/.test(parts[2])) {
        const subIndex = parts[2];
        const latStep = (latNorth - latSouth) / 2;
        const lonStep = (lonEast - lonWest) / 2;

        const subMap = { 'А': [0, 0], 'Б': [0, 1], 'В': [1, 0], 'Г': [1, 1] };
        const [row, col] = subMap[subIndex];

        latSouth += row * latStep;
        latNorth = latSouth + latStep;
        lonWest += col * lonStep;
        lonEast = lonWest + lonStep;
        bounds = L.latLngBounds(L.latLng(latSouth, lonWest), L.latLng(latNorth, lonEast));
    }

    // 6. Обработка масштаба 1:25,000 (деление 1:50,000 на 4 части а,б,в,г)
    if (parts.length > 3 && /^[абвг]$/.test(parts[3])) {
        const subIndex = parts[3];
        const latStep = (latNorth - latSouth) / 2;
        const lonStep = (lonEast - lonWest) / 2;

        const subMap = { 'а': [0, 0], 'б': [0, 1], 'в': [1, 0], 'г': [1, 1] };
        const [row, col] = subMap[subIndex];

        latSouth += row * latStep;
        latNorth = latSouth + latStep;
        lonWest += col * lonStep;
        lonEast = lonWest + lonStep;
        bounds = L.latLngBounds(L.latLng(latSouth, lonWest), L.latLng(latNorth, lonEast));
    }

    // 7. Обработка масштаба 1:10,000 (деление 1:25,000 на 4 части 1-4)
    if (parts.length > 4 && /^[1-4]$/.test(parts[4])) {
        const num = parseInt(parts[4], 10);
        const latStep = (latNorth - latSouth) / 2;
        const lonStep = (lonEast - lonWest) / 2;

        const row = (num <= 2) ? 0 : 1;
        const col = (num % 2 === 1) ? 0 : 1;

        latSouth += row * latStep;
        latNorth = latSouth + latStep;
        lonWest += col * lonStep;
        lonEast = lonWest + lonStep;
        bounds = L.latLngBounds(L.latLng(latSouth, lonWest), L.latLng(latNorth, lonEast));
    }

    return bounds;
}

/**
 * Создает GeoJSON-представление полигона (сферической трапеции) по границам.
 */
function boundsToGeoJSON(bounds, properties = {}) {
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();

    return {
        type: 'Feature',
        properties: properties,
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [southWest.lng, southWest.lat],
                [northEast.lng, southWest.lat],
                [northEast.lng, northEast.lat],
                [southWest.lng, northEast.lat],
                [southWest.lng, southWest.lat]
            ]]
        }
    };
}

/**
 * Отображает лист на карте (основная функция обновления UI).
 */
function displaySheet(nomenclature) {
    try {
        // Вычисляем границы
        const bounds = nomenclatureToBounds(nomenclature);
        currentBounds = bounds;

        // Удаляем старый слой с листом
        if (currentSheetLayer) {
            map.removeLayer(currentSheetLayer);
        }

        // Создаем новый слой с границами листа
        const geojson = boundsToGeoJSON(bounds, {
            nomenclature: nomenclature,
            scale: 'определяется автоматически' // Можно доработать
        });

        currentSheetLayer = L.geoJSON(geojson, {
            style: { color: '#d32f2f', weight: 3, fillOpacity: 0.1 }
        }).addTo(map);

        // Обновляем панель информации
        document.getElementById('current-nomenclature').textContent = nomenclature;
        document.getElementById('current-bounds').innerHTML =
            `С: ${bounds.getNorth().toFixed(4)}°<br>` +
            `Ю: ${bounds.getSouth().toFixed(4)}°<br>` +
            `З: ${bounds.getWest().toFixed(4)}°<br>` +
            `В: ${bounds.getEast().toFixed(4)}°`;

        // Масштаб определяем по длине строки (очень приблизительно)
        const parts = nomenclature.split('-');
        let scaleText = '1:1,000,000';
        if (parts.length > 1) {
            if (/^[АБВГ]$/.test(parts[1])) scaleText = '1:500,000';
            else if (/^[IVX]+$/.test(parts[1])) scaleText = '1:200,000';
            else if (/^\d+$/.test(parts[1])) scaleText = '1:100,000';
        }
        if (parts.length > 2 && /^[АБВГ]$/.test(parts[2])) scaleText = '1:50,000';
        if (parts.length > 3 && /^[абвг]$/.test(parts[3])) scaleText = '1:25,000';
        if (parts.length > 4 && /^[1-4]$/.test(parts[4])) scaleText = '1:10,000';
        if (nomenclature.includes('(')) {
            if (nomenclature.includes('-')) scaleText = '1:2,000';
            else scaleText = '1:5,000';
        }
        document.getElementById('current-scale').textContent = scaleText;

        // Приближаем карту к границам листа
        map.fitBounds(bounds, { padding: [50, 50] });

        // Рисуем сетку разграфки следующего уровня (для наглядности)
        drawGridForCurrentSheet(nomenclature, bounds);

    } catch (error) {
        alert('Ошибка в номенклатуре. Проверьте правильность ввода.');
        console.error(error);
    }
}

/**
 * Рисует сетку деления текущего листа на части следующего масштаба.
 */
function drawGridForCurrentSheet(nomenclature, bounds) {
    gridLayer.clearLayers();

    const parts = nomenclature.split('-');
    const lastPart = parts[parts.length - 1];

    let divisions = 1; // Количество частей по одной стороне
    let style = { color: '#1976d2', weight: 1, fill: false };

    // Определяем, на сколько частей делить (в зависимости от масштаба)
    if (parts.length === 1) {
        // 1:1M -> делим на 4 (для 1:500k)
        divisions = 2;
    } else if (parts.length === 2) {
        if (/^[АБВГ]$/.test(parts[1])) {
            // 1:500k -> делим на 9 (для 1:200k) - но проще на 4 не делить
            divisions = 3;
        } else if (/^[IVX]+$/.test(parts[1])) {
            // 1:200k -> делим на 4 (для 1:100k)
            divisions = 4;
        } else if (/^\d+$/.test(parts[1])) {
            // 1:100k -> делим на 4 (для 1:50k)
            divisions = 2;
        }
    } else if (parts.length === 3) {
        divisions = 2; // 1:50k -> 1:25k
    } else if (parts.length === 4) {
        divisions = 2; // 1:25k -> 1:10k
    }

    const latStep = (bounds.getNorth() - bounds.getSouth()) / divisions;
    const lngStep = (bounds.getEast() - bounds.getWest()) / divisions;

    for (let i = 0; i < divisions; i++) {
        for (let j = 0; j < divisions; j++) {
            const south = bounds.getSouth() + i * latStep;
            const north = south + latStep;
            const west = bounds.getWest() + j * lngStep;
            const east = west + lngStep;

            const cellBounds = L.latLngBounds(L.latLng(south, west), L.latLng(north, east));
            const geojson = boundsToGeoJSON(cellBounds);

            L.geoJSON(geojson, {
                style: style,
                onEachFeature: (feature, layer) => {
                    layer.on('click', () => {
                        // При клике на ячейку сетки пытаемся уточнить номенклатуру
                        // Это упрощенный вариант: просто зумируемся
                        map.fitBounds(cellBounds);
                    });
                }
            }).addTo(gridLayer);
        }
    }
}

// --- Обработчики событий интерфейса ---

// Кнопка "Найти"
document.getElementById('search-btn').addEventListener('click', () => {
    const input = document.getElementById('search-input').value.trim();
    if (input) {
        displaySheet(input);
    } else {
        alert('Введите номенклатуру листа');
    }
});

// Кнопки масштабов (предустановленные листы)
document.querySelectorAll('.scale-buttons button').forEach(btn => {
    btn.addEventListener('click', () => {
        const scale = btn.dataset.scale;
        let exampleNomenclature = '';
        switch (scale) {
            case '1 000 000': exampleNomenclature = 'N-37'; break;
            case '500 000': exampleNomenclature = 'N-37-Б'; break;
            case '200 000': exampleNomenclature = 'N-37-XVI'; break;
            case '100 000': exampleNomenclature = 'N-37-56'; break;
            case '50 000': exampleNomenclature = 'N-37-56-А'; break;
            case '25 000': exampleNomenclature = 'N-37-56-А-в'; break;
            case '10 000': exampleNomenclature = 'N-37-56-А-в-1'; break;
            case '5 000': exampleNomenclature = 'N-37-56(70)'; break;
            case '2 000': exampleNomenclature = 'N-37-56(70-и)'; break;
        }
        if (exampleNomenclature) {
            document.getElementById('search-input').value = exampleNomenclature;
            displaySheet(exampleNomenclature);
        }
    });
});

// --- Запуск: отображаем стартовый лист (Москва, N-37) ---
window.addEventListener('load', () => {
    displaySheet('N-37');
});