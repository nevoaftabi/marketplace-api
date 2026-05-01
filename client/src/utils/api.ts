let accessToken: string | null = null;

export const setToken = (token: string | null) => accessToken = token;
export const getToken = () => accessToken;

export const apiFetch = async(url: string, options: RequestInit = {}): Promise<Response> => {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { 'Authorization': `Bearer ${accessToken}`}: {}),
            ...options.headers
        }
    });

    if(res.status === 401) {
        const refreshToken = localStorage.getItem("refreshToken");
        if(!refreshToken) throw new Error("Not authenticated");

        const refreshRes = await fetch("/api/auth/refresh", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });

        const { accessToken: newToken } = await refreshRes.json();
        accessToken = newToken;

        return apiFetch(url, options);
    }

    return res;
}