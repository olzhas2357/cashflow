import Header from '@/components/landing/Header'
import Hero from '@/components/landing/Hero'
import HowItWorks from '@/components/landing/HowItWorks'
import Footer from '@/components/landing/Footer'

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <Hero />
      <HowItWorks />
      <div className="mt-auto">
        <Footer />
      </div>
    </div>
  )
}
