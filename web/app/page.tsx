"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.push("/dashboard")
  }, [router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <p>Redirecting to dashboard...</p>
    </div>
  )
}
