/**
 * Geocoding reference service for global logistics hubs and ports.
 * Provides real-world city and port coordinates for route and waypoint mapping.
 * Coordinates represent physical municipality / cargo port locations.
 */

const LOGISTICS_COORDINATES = {
    "tokyo": { lat: 35.6762, lng: 139.6503, name: "Tokyo, JP", type: "Port & Logistics Hub" },
    "seattle": { lat: 47.6062, lng: -122.3321, name: "Seattle, US", type: "Gateway Port" },
    "busan": { lat: 35.1796, lng: 129.0756, name: "Busan, KR", type: "Container Terminal" },
    "long beach": { lat: 33.7701, lng: -118.1937, name: "Long Beach, US", type: "Ocean Gateway" },
    "ho chi minh city": { lat: 10.8231, lng: 106.6297, name: "Ho Chi Minh City, VN", type: "Logistics Hub" },
    "antwerp": { lat: 51.2194, lng: 4.4025, name: "Antwerp, BE", type: "Deepwater Port" },
    "shanghai": { lat: 31.2304, lng: 121.4737, name: "Shanghai, CN", type: "Global Cargo Hub" },
    "los angeles": { lat: 34.0522, lng: -118.2437, name: "Los Angeles, US", type: "Freight Gateway" },
    "singapore": { lat: 1.3521, lng: 103.8198, name: "Singapore, SG", type: "Transshipment Hub" },
    "rotterdam": { lat: 51.9244, lng: 4.4777, name: "Rotterdam, NL", type: "Deepwater Gateway" },
    "hamburg": { lat: 53.5511, lng: 9.9937, name: "Hamburg, DE", type: "Logistics Port" },
    "frankfurt": { lat: 50.1109, lng: 8.6821, name: "Frankfurt, DE", type: "Air Cargo Hub" },
    "london": { lat: 51.5074, lng: -0.1278, name: "London, UK", type: "Logistics Center" },
    "dubai": { lat: 25.2048, lng: 55.2708, name: "Dubai, AE", type: "International Cargo Hub" },
    "shenzhen": { lat: 22.5431, lng: 114.0579, name: "Shenzhen, CN", type: "Container Hub" },
    "hyderabad": { lat: 17.3850, lng: 78.4867, name: "Hyderabad, IN", type: "Air Freight Terminal" },
    "new york": { lat: 40.7128, lng: -74.0060, name: "New York, US", type: "Intermodal Terminal" },
    "hong kong": { lat: 22.3193, lng: 114.1694, name: "Hong Kong, HK", type: "Air & Ocean Cargo" }
};

/**
 * Resolve a location string (e.g. "Tokyo, JP", "In network — Shanghai hub") to real geographic coordinates.
 */
const resolveLocationCoordinates = (locationText) => {
    if (!locationText || typeof locationText !== "string") {
        return null;
    }

    const lower = locationText.toLowerCase();

    for (const [key, coords] of Object.entries(LOGISTICS_COORDINATES)) {
        if (lower.includes(key)) {
            return {
                lat: coords.lat,
                lng: coords.lng,
                label: coords.name,
                hub_type: coords.type,
                raw_location: locationText,
                source: "city_port_reference"
            };
        }
    }

    return null;
};

module.exports = {
    LOGISTICS_COORDINATES,
    resolveLocationCoordinates
};
