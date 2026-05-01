import { createContext } from "react";

// The type defines what data it holds; the access token and a function to update it
type AuthContextType = {
    accessToken: string | null
    refreshToken: string | null
    setAccessToken: (token: string) => void
    setRefreshToken: (token: string) => void
}

// Creates a React context object, which is like a "container" that can hold data and make it available
// to any component in the tree without prop drilling. 
export const AuthContext = createContext<AuthContextType | null>(null);
