"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv = require("dotenv");
dotenv.config({ path: '.env.local' });
var supabase_1 = require("../../src/lib/supabase");
var path = require("path");
var XLSX = require('xlsx');
function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.pow(Math.sin(dLat / 2), 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.pow(Math.sin(dLon / 2), 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// Map state abbreviations to full names for matching
var STATE_MAP = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
    'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
    'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
    'DC': 'District of Columbia', 'PR': 'Puerto Rico', 'GU': 'Guam', 'VI': 'Virgin Islands',
    'AS': 'American Samoa', 'MP': 'Northern Mariana Islands', 'PW': 'Palau'
};
function ingestSunshine() {
    return __awaiter(this, void 0, void 0, function () {
        var supabase, filePath, wb, ws, data, stations, i, row, stationName, clearDays, pcDays, cdDays, parts, stateAbbr, cities, page, batch, fs, noaaDir, noaaFiles, stationCoords, _i, noaaFiles_1, file, content, firstLine, fields, cur, inQ, _a, firstLine_1, ch, id, lat, lng, name_1, stationsWithCoords, _b, stations_1, ss, ssNameNorm, bestMatch, bestScore, _c, stationCoords_1, sc, scNameNorm, score, unmatchedStations, _loop_1, _d, unmatchedStations_1, ss, updates, _e, cities_1, city, nearest, minDist, _f, stationsWithCoords_1, s, d, debugCities, _loop_2, _g, debugCities_1, name_2, i, batch;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    supabase = (0, supabase_1.createServiceClient)();
                    console.log('Ingesting NOAA Cloudiness / Sunny Days data...');
                    filePath = path.resolve(__dirname, '../../data/NOAA_Mean_Cloud_Cover_Days.xlsx');
                    wb = XLSX.readFile(filePath);
                    ws = wb.Sheets[wb.SheetNames[0]];
                    data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                    stations = [];
                    for (i = 3; i < data.length; i++) {
                        row = data[i];
                        if (!row || row.length < 42)
                            continue;
                        stationName = String(row[1] || '').trim();
                        if (!stationName)
                            continue;
                        clearDays = parseInt(row[39]);
                        pcDays = parseInt(row[40]);
                        cdDays = parseInt(row[41]);
                        if (isNaN(clearDays))
                            continue;
                        parts = stationName.split(',');
                        stateAbbr = (parts[parts.length - 1] || '').trim();
                        stations.push({
                            name: parts[0].trim(),
                            stateAbbr: stateAbbr,
                            clearDays: clearDays,
                            partlyCloudyDays: isNaN(pcDays) ? 0 : pcDays,
                            cloudyDays: isNaN(cdDays) ? 0 : cdDays,
                        });
                    }
                    console.log("Parsed ".concat(stations.length, " sunshine stations."));
                    // Debug: show a few
                    stations.slice(0, 5).forEach(function (s) { return console.log("  ".concat(s.name, ", ").concat(s.stateAbbr, ": ").concat(s.clearDays, " clear, ").concat(s.partlyCloudyDays, " PC, ").concat(s.cloudyDays, " cloudy")); });
                    cities = [];
                    page = 0;
                    _h.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 3];
                    return [4 /*yield*/, supabase.from('cities')
                            .select('fips_code, latitude, longitude, name, state_code')
                            .range(page * 1000, (page + 1) * 1000 - 1)];
                case 2:
                    batch = (_h.sent()).data;
                    if (!batch || batch.length === 0)
                        return [3 /*break*/, 3];
                    cities.push.apply(cities, batch);
                    page++;
                    return [3 /*break*/, 1];
                case 3:
                    console.log("Loaded ".concat(cities.length, " cities."));
                    fs = require('fs');
                    noaaDir = path.resolve(__dirname, '../../data/noaa-climate');
                    noaaFiles = fs.readdirSync(noaaDir).filter(function (f) { return f.endsWith('.csv') && f.startsWith('USW'); });
                    stationCoords = [];
                    for (_i = 0, noaaFiles_1 = noaaFiles; _i < noaaFiles_1.length; _i++) {
                        file = noaaFiles_1[_i];
                        try {
                            content = fs.readFileSync(path.join(noaaDir, file), 'utf-8');
                            firstLine = content.split('\n')[1];
                            if (!firstLine)
                                continue;
                            fields = [];
                            cur = '', inQ = false;
                            for (_a = 0, firstLine_1 = firstLine; _a < firstLine_1.length; _a++) {
                                ch = firstLine_1[_a];
                                if (ch === '"')
                                    inQ = !inQ;
                                else if (ch === ',' && !inQ) {
                                    fields.push(cur.trim());
                                    cur = '';
                                }
                                else
                                    cur += ch;
                            }
                            fields.push(cur.trim());
                            id = fields[0];
                            lat = parseFloat(fields[1]);
                            lng = parseFloat(fields[2]);
                            name_1 = fields[4] || '';
                            if (!isNaN(lat) && !isNaN(lng)) {
                                stationCoords.push({ id: id, lat: lat, lng: lng, name: name_1 });
                            }
                        }
                        catch (_j) { }
                    }
                    console.log("Loaded ".concat(stationCoords.length, " NOAA station coordinates."));
                    stationsWithCoords = [];
                    for (_b = 0, stations_1 = stations; _b < stations_1.length; _b++) {
                        ss = stations_1[_b];
                        ssNameNorm = ss.name.toLowerCase().replace(/[^a-z]/g, '');
                        bestMatch = null;
                        bestScore = 0;
                        for (_c = 0, stationCoords_1 = stationCoords; _c < stationCoords_1.length; _c++) {
                            sc = stationCoords_1[_c];
                            scNameNorm = sc.name.toLowerCase().replace(/[^a-z]/g, '');
                            // Check if the sunshine station name is a prefix of NOAA station name
                            if (scNameNorm.includes(ssNameNorm) || ssNameNorm.includes(scNameNorm)) {
                                score = Math.min(ssNameNorm.length, scNameNorm.length);
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestMatch = sc;
                                }
                            }
                        }
                        if (bestMatch) {
                            stationsWithCoords.push(__assign(__assign({}, ss), { lat: bestMatch.lat, lng: bestMatch.lng }));
                        }
                    }
                    console.log("Matched ".concat(stationsWithCoords.length, " / ").concat(stations.length, " sunshine stations to coordinates."));
                    unmatchedStations = stations.filter(function (ss) {
                        return !stationsWithCoords.find(function (s) { return s.name === ss.name && s.stateAbbr === ss.stateAbbr; });
                    });
                    _loop_1 = function (ss) {
                        // Find a city in the same state
                        var stateCode = ss.stateAbbr;
                        var stateCities = cities.filter(function (c) { return c.state_code === stateCode; });
                        if (stateCities.length > 0) {
                            // Use the first matching city's coords as an approximation
                            var cityNameNorm = ss.name.toLowerCase().replace(/[^a-z]/g, '');
                            var bestCity = stateCities[0];
                            for (var _k = 0, stateCities_1 = stateCities; _k < stateCities_1.length; _k++) {
                                var c = stateCities_1[_k];
                                if (c.name.toLowerCase().replace(/[^a-z]/g, '').includes(cityNameNorm)) {
                                    bestCity = c;
                                    break;
                                }
                            }
                            stationsWithCoords.push(__assign(__assign({}, ss), { lat: bestCity.latitude, lng: bestCity.longitude }));
                        }
                    };
                    for (_d = 0, unmatchedStations_1 = unmatchedStations; _d < unmatchedStations_1.length; _d++) {
                        ss = unmatchedStations_1[_d];
                        _loop_1(ss);
                    }
                    console.log("Total sunshine stations with coords: ".concat(stationsWithCoords.length));
                    updates = [];
                    for (_e = 0, cities_1 = cities; _e < cities_1.length; _e++) {
                        city = cities_1[_e];
                        if (!city.latitude || !city.longitude)
                            continue;
                        nearest = null;
                        minDist = Infinity;
                        for (_f = 0, stationsWithCoords_1 = stationsWithCoords; _f < stationsWithCoords_1.length; _f++) {
                            s = stationsWithCoords_1[_f];
                            d = haversine(city.latitude, city.longitude, s.lat, s.lng);
                            if (d < minDist) {
                                minDist = d;
                                nearest = s;
                            }
                        }
                        if (nearest) {
                            updates.push({
                                fips_code: city.fips_code,
                                sunny_days: nearest.clearDays + nearest.partlyCloudyDays,
                            });
                        }
                    }
                    console.log("Built ".concat(updates.length, " sunny day updates."));
                    debugCities = ['Wailuku', 'Phoenix', 'Seattle', 'Miami', 'Raleigh'];
                    _loop_2 = function (name_2) {
                        var u = updates.find(function (u) {
                            var c = cities.find(function (c) { return c.fips_code === u.fips_code; });
                            return c && c.name === name_2;
                        });
                        if (u) {
                            var c = cities.find(function (c) { return c.fips_code === u.fips_code; });
                            console.log("  [DEBUG] ".concat(c.name, ", ").concat(c.state_code, ": ").concat(u.sunny_days, " clear days"));
                        }
                    };
                    for (_g = 0, debugCities_1 = debugCities; _g < debugCities_1.length; _g++) {
                        name_2 = debugCities_1[_g];
                        _loop_2(name_2);
                    }
                    i = 0;
                    _h.label = 4;
                case 4:
                    if (!(i < updates.length)) return [3 /*break*/, 7];
                    batch = updates.slice(i, i + 200);
                    return [4 /*yield*/, Promise.all(batch.map(function (b) {
                            return supabase.from('city_climate').update(b).eq('fips_code', b.fips_code);
                        }))];
                case 5:
                    _h.sent();
                    console.log("Updated ".concat(Math.min(i + 200, updates.length), " / ").concat(updates.length));
                    _h.label = 6;
                case 6:
                    i += 200;
                    return [3 /*break*/, 4];
                case 7:
                    console.log('NOAA Sunshine/Cloudiness Ingestion Complete!');
                    return [2 /*return*/];
            }
        });
    });
}
ingestSunshine().catch(console.error);
