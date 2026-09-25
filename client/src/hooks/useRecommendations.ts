import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { fetchApi } from '../lib/fetchApi'

import type {
  ScoreBreakdown,
  RecommendationItem,
  UserTasteProfile,
  RecommendationsApiResponse,
} from '../types/recommendations'

export type { ScoreBreakdown, RecommendationItem, UserTasteProfile, RecommendationsApiResponse }


export const useRecommendations = (limit = 20, offset = 0) => {
  return useQuery<RecommendationItem[]>({
    queryKey: ['recommendations', 'for_you', limit, offset],
    queryFn: async () => {
      const res: RecommendationsApiResponse = await fetchApi(
        `/api/recommendations/for-you?limit=${limit}&offset=${offset}`
      )
      return res.data || []
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  })
}

export const useLocalLibraryRecommendations = (limit = 20, offset = 0) => {
  return useQuery<RecommendationItem[]>({
    queryKey: ['recommendations', 'local_library', limit, offset],
    queryFn: async () => {
      const res: RecommendationsApiResponse = await fetchApi(
        `/api/recommendations/local-library?limit=${limit}&offset=${offset}`
      )
      return res.data || []
    },
    staleTime: 1000 * 60 * 30,
  })
}

export const useTasteProfile = () => {
  return useQuery<UserTasteProfile | null>({
    queryKey: ['recommendations', 'profile'],
    queryFn: async () => {
      const res = await fetchApi('/api/recommendations/profile')
      return res.profile || null
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  })
}

export const useRefreshRecommendations = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/recommendations/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Failed to trigger refresh')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Refreshing recommendations in background...')
      queryClient.invalidateQueries({ queryKey: ['recommendations'] })
    },
    onError: () => {
      toast.error('Failed to trigger recommendation refresh')
    },
  })
}

export const useDismissRecommendation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (showId: string) => {
      const res = await fetch(`/api/recommendations/${showId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Failed to dismiss recommendation')
      return res.json()
    },
    onMutate: async (showId: string) => {
      // Optimistically remove from queries
      await queryClient.cancelQueries({ queryKey: ['recommendations'] })

      const previousForYou = queryClient.getQueryData<RecommendationItem[]>([
        'recommendations',
        'for_you',
        20,
        0,
      ])
      const previousLocal = queryClient.getQueryData<RecommendationItem[]>([
        'recommendations',
        'local_library',
        20,
        0,
      ])

      if (previousForYou) {
        queryClient.setQueryData<RecommendationItem[]>(
          ['recommendations', 'for_you', 20, 0],
          previousForYou.filter((r) => r.showId !== showId)
        )
      }

      if (previousLocal) {
        queryClient.setQueryData<RecommendationItem[]>(
          ['recommendations', 'local_library', 20, 0],
          previousLocal.filter((r) => r.showId !== showId)
        )
      }

      return { previousForYou, previousLocal }
    },
    onError: (_err, _showId, context) => {
      if (context?.previousForYou) {
        queryClient.setQueryData(
          ['recommendations', 'for_you', 20, 0],
          context.previousForYou
        )
      }
      if (context?.previousLocal) {
        queryClient.setQueryData(
          ['recommendations', 'local_library', 20, 0],
          context.previousLocal
        )
      }
      toast.error('Could not dismiss recommendation')
    },
    onSuccess: () => {
      toast.success('Recommendation dismissed')
      queryClient.invalidateQueries({ queryKey: ['recommendations'] })
    },
  })
}
