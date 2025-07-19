"use client"

import * as React from "react"
import { cn } from "../utils"
import "../styles/components.css"

export interface LogoCarouselProps {
  logos: { src: string; alt: string; href?: string }[]
  className?: string
  speed?: number
  direction?: "left" | "right"
  pauseOnHover?: boolean
}

export function LogoCarousel({
  logos = [],
  className,
  speed = 30,
  direction = "left",
  pauseOnHover = true,
}: LogoCarouselProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const [start, setStart] = React.useState(false)

  // Set CSS variables for animation
  React.useEffect(() => {
    if (!containerRef.current) return;
    
    // Set CSS variables via data attributes instead of inline styles
    containerRef.current.dataset.scrollDuration = `${speed}s`;
    containerRef.current.dataset.scrollDirection = direction === "right" ? "reverse" : "normal";
    
    // Update CSS variables when props change
    document.documentElement.style.setProperty('--scroll-duration', `${speed}s`);
    document.documentElement.style.setProperty('--scroll-direction', direction === "right" ? "reverse" : "normal");
  }, [speed, direction]);

  React.useEffect(() => {
    if (!scrollerRef.current || !containerRef.current) return
    
    // Add event listeners for resize to handle responsive behavior
    const onResize = () => {
      if (!scrollerRef.current || !containerRef.current) return
      
      const scrollerContent = Array.from(scrollerRef.current.children)
      
      // If we don't have enough logos to scroll, duplicate them
      if (scrollerContent.length <= 8) {
        const duplicateContent = [...scrollerContent].map((item) => item.cloneNode(true))
        duplicateContent.forEach((item) => {
          scrollerRef.current?.appendChild(item)
        })
      }
      
      setStart(true)
    }

    // Call once on mount
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn(
        "logo-carousel-container",
        className,
        pauseOnHover && "with-pause-hover"
      )}
    >
      <div
        ref={scrollerRef}
        className={cn(
          "logo-carousel-scroller",
          start && "animate"
        )}
      >
        {logos.map((logo, idx) => (
          <div
            className="logo-item"
            key={idx}
          >
            {logo.href ? (
              <a
                href={logo.href}
                target="_blank"
                rel="noopener noreferrer"
                className="logo-link"
              >
                <img
                  src={logo.src}
                  alt={logo.alt}
                  className="logo-image"
                />
              </a>
            ) : (
              <img
                src={logo.src}
                alt={logo.alt}
                className="logo-image"
              />
            )}
          </div>
        ))}
      </div>
      
      <div
        className={cn(
          "logo-carousel-scroller",
          start && "animate"
        )}
      >
        {logos.map((logo, idx) => (
          <div
            className="logo-item"
            key={`duplicate-${idx}`}
          >
            {logo.href ? (
              <a
                href={logo.href}
                target="_blank"
                rel="noopener noreferrer"
                className="logo-link"
              >
                <img
                  src={logo.src}
                  alt={logo.alt}
                  className="logo-image"
                />
              </a>
            ) : (
              <img
                src={logo.src}
                alt={logo.alt}
                className="logo-image"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
