import React from 'react'
import type { Anime } from '../../hooks/useAnimeData'
import { useSpotlightSettings } from '../../hooks/useSpotlightSettings'
import ModernSpotlightBanner from './ModernSpotlightBanner'
import LegacySpotlightBanner from './LegacySpotlightBanner'

interface SpotlightBannerProps {
  animeList: Anime[]
}

const SpotlightBanner: React.FC<SpotlightBannerProps> = ({ animeList }) => {
  const { isModern, blur } = useSpotlightSettings()

  if (!animeList || animeList.length === 0) return null

  if (!isModern) {
    return <LegacySpotlightBanner animeList={animeList} />
  }

  return <ModernSpotlightBanner animeList={animeList} blur={blur} />
}

export default SpotlightBanner
