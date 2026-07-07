'use client';

import { useRouter } from 'next/navigation';

export default function UnauthorizedPage() {
    const router = useRouter();

    return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 glass">
            <h1 className="text-4xl font-bold text-red-500 mb-4">403 - Access Denied</h1>
            <p className="text-gray-400 mb-8 max-w-md">
                You do not have the required permissions to view this part of the Admin Portal. 
                Please ensure you are logged in with an Admin or Super Admin account.
            </p>
            <button 
                onClick={() => router.push('/')}
                className="btn btn-primary"
            >
                Back to Login
            </button>
        </div>
    );
}
