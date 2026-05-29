import api from './api';

export const fetchAllPages = async (url) => {
    const firstResponse = await api.get(url);
    const firstPage = firstResponse.data;

    if (Array.isArray(firstPage) || !firstPage?.results) {
        return firstPage;
    }

    const results = [...firstPage.results];
    let nextUrl = firstPage.next;

    while (nextUrl) {
        const response = await api.get(nextUrl);
        const page = response.data;
        results.push(...(page.results || []));
        nextUrl = page.next;
    }

    return results;
};
