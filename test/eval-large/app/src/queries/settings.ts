import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { NotificationSettings, Profile } from '../api/types';

export const useProfile = () => useQuery({ queryKey: ['profile'], queryFn: api.profile });

export function useSaveProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (profile: Profile) => api.saveProfile(profile),
    onSuccess: (profile) => client.setQueryData(['profile'], profile),
  });
}

export const useNotificationSettings = () => useQuery({ queryKey: ['notification-settings'], queryFn: api.notificationSettings });

export function useSaveNotificationSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: NotificationSettings) => api.saveNotificationSettings(settings),
    onSuccess: (settings) => client.setQueryData(['notification-settings'], settings),
  });
}
