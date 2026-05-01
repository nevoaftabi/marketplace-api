import { useState } from 'react';
import { AuthContext } from './AuthContext';

// This is a component that wraps your app.
// It holds the actual useState for the token and passes the value into the context. 
// Any component inside it can read and update the token
export const AuthProvider = ({children}: { children: React.ReactNode }) => {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    
    return (
        <AuthContext.Provider value={{accessToken, refreshToken, setAccessToken, setRefreshToken}}>
            {children}
        </AuthContext.Provider>
    )
}
