import fs from 'fs';
export function parseBaselineRoutes(htmlPath) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script\s+type="application\/json"\s+data-routes\s*>([\s\S]*?)<\/script>/);
    if (!match?.[1])
        throw new Error('No <script data-routes> manifest found in HTML');
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed) || parsed.length === 0)
        throw new Error('data-routes manifest is empty or not an array');
    return parsed.map((route, index) => {
        if (!route || typeof route.name !== 'string' || typeof route.nav !== 'string' || typeof route.path !== 'string') {
            throw new Error(`Invalid route entry at index ${index}: name, nav, and path are required`);
        }
        if (!route.path.startsWith('/'))
            throw new Error(`Invalid route entry at index ${index}: path must start with /`);
        return { name: route.name, nav: route.nav, path: route.path };
    });
}
