import Header from '@/components/landing/Header'
import Hero from '@/components/landing/Hero'
import HowItWorks from '@/components/landing/HowItWorks'
import Footer from '@/components/landing/Footer'
import GhostCursorBackground from '@/components/landing/GhostCursorBackground'
import NewDesign from '@/components/landing/NewDesign'

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* <GhostCursorBackground /> */}
      <Header />
      <Hero />
      <HowItWorks />
        {/* <NewDesign /> */}
      <div className="mt-auto">
        <Footer />
      </div>
    </div>
  )
}
