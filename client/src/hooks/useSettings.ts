import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

const getAuthHeaders = (): Record<string, string> => {
  try {
    const token = localStorage.getItem('dango_auth_token') || sessionStorage.getItem('dango_auth_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

const fetchSettings = async (key: string) => {
  const response = await fetch(`/api/settings?key=${key}`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    throw new Error('Failed to fetch settings')
  }
  const data = await response.json()
  return data.value
}

const updateSettings = async ({ key, value }: { key: string; value: unknown }) => {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ key, value }),
  })
  if (!response.ok) {
    throw new Error('Failed to update settings')
  }
  return response.json()
}

export const useSetting = (key: string) => {
  return useQuery<unknown>({
    queryKey: ['settings', key],
    queryFn: () => fetchSettings(key),
  })
}

export interface UseUpdateSettingOptions {
  silent?: boolean
}

export const useUpdateSetting = (options?: UseUpdateSettingOptions) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      if (!options?.silent) {
        toast.success('Setting updated!')
      }
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error) => {
      if (!options?.silent) {
        toast.error(`Failed to update setting: ${error.message}`)
      }
    },
  })
}
