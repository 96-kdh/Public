import { configureStore } from '@reduxjs/toolkit';
import walletReducer from './slice/wallet.slice';

export const store = configureStore({
    reducer: {
        walletReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
