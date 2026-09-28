import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { activityReducer } from './activity';
import { issuesReducer } from './issues';
import { notificationsReducer } from './notifications';

export const store = configureStore({
  reducer: {
    issues: issuesReducer,
    notifications: notificationsReducer,
    activity: activityReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
