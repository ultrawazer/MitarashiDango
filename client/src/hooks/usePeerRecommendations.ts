import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { fetchApi } from '../lib/fetchApi'
import type {
  EligibleRecipient,
  FriendRecommendationGroup,
  PeerNotification,
} from '../types/peer-recommendations'

export const useEligibleRecipients = () => {
  return useQuery<EligibleRecipient[]>({
    queryKey: ['peer-recommendations', 'recipients'],
    queryFn: async () => {
      const res = await fetchApi<{ recipients: EligibleRecipient[] }>(
        '/api/peer-recommendations/recipients'
      )
      return res.recipients || []
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export const useFriendRecommendationsFeed = () => {
  return useQuery<FriendRecommendationGroup[]>({
    queryKey: ['peer-recommendations', 'feed'],
    queryFn: async () => {
      const res = await fetchApi<{ recommendations: FriendRecommendationGroup[] }>(
        '/api/peer-recommendations/feed'
      )
      return res.recommendations || []
    },
    staleTime: 1000 * 30, // 30 seconds
  })
}

export const usePeerNotifications = () => {
  return useQuery<PeerNotification[]>({
    queryKey: ['peer-recommendations', 'notifications'],
    queryFn: async () => {
      const res = await fetchApi<{ notifications: PeerNotification[] }>(
        '/api/peer-recommendations/notifications'
      )
      return res.notifications || []
    },
    staleTime: 1000 * 15, // 15 seconds
    refetchInterval: 1000 * 30, // Poll every 30s
  })
}

export const useSendPeerRecommendation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      recipientId: string
      showId: string
      showTitle: string
      showTitleEnglish?: string | null
      showTitleNative?: string | null
      showThumbnail?: string | null
      showType?: string | null
      note?: string | null
    }) => {
      return await fetchApi<{ success: boolean; message: string }>(
        '/api/peer-recommendations/send',
        {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        }
      )
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Recommendation sent!')
      queryClient.invalidateQueries({ queryKey: ['peer-recommendations'] })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to send recommendation')
    },
  })
}

export const useMarkPeerNotificationRead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      return await fetchApi<{ success: boolean }>(
        `/api/peer-recommendations/${notificationId}/read`,
        {
          method: 'POST',
        }
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peer-recommendations', 'notifications'] })
      queryClient.invalidateQueries({ queryKey: ['peer-recommendations', 'feed'] })
    },
  })
}

export const useDismissFriendShow = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (showId: string) => {
      return await fetchApi<{ success: boolean }>(
        `/api/peer-recommendations/dismiss-show/${showId}`,
        {
          method: 'POST',
        }
      )
    },
    onSuccess: () => {
      toast.success('Removed from friend recommendations')
      queryClient.invalidateQueries({ queryKey: ['peer-recommendations', 'feed'] })
      queryClient.invalidateQueries({ queryKey: ['peer-recommendations', 'notifications'] })
    },
    onError: () => {
      toast.error('Failed to dismiss recommendation')
    },
  })
}
