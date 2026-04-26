import { createContext, useContext } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AppContext = createContext<Record<string, any>>({});

export const useAppContext = () => useContext(AppContext);

export default AppContext;
