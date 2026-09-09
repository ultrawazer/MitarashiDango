import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { subscribeAuthRequired, type ExtensionAuthPayload } from '../lib/auth-bus'
import { ExtensionAuthModal } from '../components/extensions/ExtensionAuthModal'

export interface ExtensionAuthContextType {
  isOpen: boolean
  activePrompt: ExtensionAuthPayload | null
  openAuthModal: (payload: ExtensionAuthPayload) => void
  closeAuthModal: () => void
}

const ExtensionAuthContext = createContext<ExtensionAuthContextType | undefined>(undefined)

export const ExtensionAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [activePrompt, setActivePrompt] = useState<ExtensionAuthPayload | null>(null)

  const openAuthModal = useCallback((payload: ExtensionAuthPayload) => {
    setActivePrompt(payload)
    setIsOpen(true)
  }, [])

  const closeAuthModal = useCallback(() => {
    setIsOpen(false)
  }, [])

  useEffect(() => {
    return subscribeAuthRequired<ExtensionAuthPayload>('extension', (payload) => {
      if (payload && payload.extensionId) {
        openAuthModal(payload)
      }
    })
  }, [openAuthModal])

  return (
    <ExtensionAuthContext.Provider
      value={{ isOpen, activePrompt, openAuthModal, closeAuthModal }}
    >
      {children}
      {activePrompt && (
        <ExtensionAuthModal
          isOpen={isOpen}
          onClose={closeAuthModal}
          extensionId={activePrompt.extensionId}
          extensionName={activePrompt.extensionName}
          verificationUrl={activePrompt.verificationUrl}
        />
      )}
    </ExtensionAuthContext.Provider>
  )
}

export const useExtensionAuth = (): ExtensionAuthContextType => {
  const context = useContext(ExtensionAuthContext)
  if (!context) {
    throw new Error('useExtensionAuth must be used within an ExtensionAuthProvider')
  }
  return context
}
