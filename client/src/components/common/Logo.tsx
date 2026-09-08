import React from 'react'
import { useThemedLogo } from '../../hooks/useThemedLogo'

interface LogoProps {
  className?: string
  style?: React.CSSProperties
}

const Logo: React.FC<LogoProps> = ({ className, style }) => {
  const logoSrc = useThemedLogo()

  return (
    <img
      src={logoSrc}
      alt="dango"
      className={className}
      style={{
        height: 'var(--logo-height, 75px)',
        width: 'auto',
        display: 'block',
        objectFit: 'contain',
        ...style,
      }}
    />
  )
}

export default Logo
