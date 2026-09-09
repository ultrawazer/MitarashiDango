import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './styles/base.css'
import { SidebarProvider } from './contexts/SidebarProvider'
import { TitlePreferenceProvider } from './contexts/TitlePreferenceProvider'
import { LowEndModeProvider } from './contexts/LowEndModeProvider'
import { ThemeProvider } from './contexts/ThemeProvider'
import { ExtensionAuthProvider } from './contexts/ExtensionAuthProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: true,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ExtensionAuthProvider>
          <SidebarProvider>
            <TitlePreferenceProvider>
              <LowEndModeProvider>
                <ThemeProvider>
                  <App />
                </ThemeProvider>
              </LowEndModeProvider>
            </TitlePreferenceProvider>
          </SidebarProvider>
        </ExtensionAuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)
