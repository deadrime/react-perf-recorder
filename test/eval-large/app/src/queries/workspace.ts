import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Label, Project } from '../api/types';

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x])) as Record<string, T>;

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity });

export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: api.projects, staleTime: Infinity });

const selectProjectsById = (projects: Project[]) => byId(projects);
export const useProjectsById = () =>
  useQuery({ queryKey: ['projects'], queryFn: api.projects, staleTime: Infinity, select: selectProjectsById }).data;

export const useProject = (id: string | null | undefined) => useProjectsById()?.[id ?? ''];

export const useLabels = () => useQuery({ queryKey: ['labels'], queryFn: api.labels, staleTime: Infinity });

const selectLabelsById = (labels: Label[]) => byId(labels);
export const useLabelsById = () => useQuery({ queryKey: ['labels'], queryFn: api.labels, staleTime: Infinity, select: selectLabelsById }).data;
