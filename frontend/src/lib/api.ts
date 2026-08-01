import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const api = axios.create({
    baseURL: `${API_URL}/api`,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
});

/**
 * Let a file upload be a file upload.
 *
 * The instance above sets `Content-Type: application/json` for every request,
 * which is right for the ~40 JSON endpoints and silently fatal for the one
 * multipart endpoint: axios will not overwrite a Content-Type that has already
 * been set, so a `FormData` body went out labelled `application/json` and
 * *without* the `boundary=` parameter multipart parsing depends on. The server
 * then found no file and rejected the request as empty.
 *
 * Deleting the header lets axios detect the FormData and set
 * `multipart/form-data; boundary=…` itself. It must be deleted rather than
 * assigned — naming the header at all is what strips the boundary.
 *
 * Registered before the auth interceptor so ordering is obvious; both run on
 * every request regardless.
 */
api.interceptors.request.use((config) => {
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
        delete config.headers['Content-Type'];
        delete config.headers['content-type'];
    }
    return config;
});

// Attach Neon Auth / admin access token to every request
api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('accessToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

// On 401, clear local state and redirect to login
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('accessToken');
            if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
