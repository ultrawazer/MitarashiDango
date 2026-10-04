export interface EligibleRecipient {
  id: string
  username: string
  displayName: string
  avatarPath: string | null
}

export interface RecommenderInfo {
  id: string
  senderId: string
  username: string
  displayName: string
  avatarPath: string | null
  note: string | null
  createdAt: string
  status: 'unread' | 'read' | 'dismissed'
}

export interface FriendRecommendationGroup {
  showId: string
  showTitle: string
  showTitleEnglish: string | null
  showTitleNative: string | null
  showThumbnail: string | null
  showType: string | null
  latestCreatedAt: string
  count: number
  recommenders: RecommenderInfo[]
}

export interface PeerNotification {
  id: string
  showId: string
  title: string
  sender: {
    id: string
    username: string
    displayName: string
    avatarPath: string | null
  }
  show: {
    id: string
    title: string
    englishTitle: string | null
    nativeTitle: string | null
    thumbnail: string | null
    type: string | null
  }
  note: string | null
  createdAt: string
}
