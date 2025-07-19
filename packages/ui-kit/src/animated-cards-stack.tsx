"use client"

import * as React from "react"
import { cn } from "../utils"
import "../styles/components.css"

const reviewStarsArray = [1, 2, 3, 4, 5]

type CardTransformedProps = {
  index: number
  className?: string
  variant?: "light" | "dark"
  arrayLength: number
  children?: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>

type ReviewStarsProps = {
  rating: number
  className?: string
}

type CardContainerProps = {
  className?: string
  children?: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>

type ContainerScrollProps = {
  className?: string
  children?: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>

const variants = {
  light: {
    background: "bg-white dark:bg-white",
    color: "text-black dark:text-black",
  },
  dark: {
    background: "bg-background border border-muted-foreground/20",
    color: "text-foreground",
  },
}

export function CardsContainer({ className, children, ...props }: CardContainerProps) {
  return (
    <div
      className={cn("card-container", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTransformed({
  arrayLength,
  index,
  children,
  variant = "light",
  className,
  ...props
}: CardTransformedProps) {
  const card = React.useRef<HTMLDivElement>(null)
  const [transformStyle, setTransformStyle] = React.useState<string>('')
  const [opacityValue, setOpacityValue] = React.useState<number>(1)
  
  const calculatePosition = React.useCallback(() => {
    if (!card.current) return

    const scrollY = window.scrollY
    const elementHeight = window.innerHeight
    const elementTop = card.current.getBoundingClientRect().top + scrollY
    const parentTop = card.current.offsetParent
      ? (card.current.offsetParent as HTMLElement).offsetTop
      : 0
    const elementRelativeTop = elementTop - parentTop

    const rotationPoint = elementRelativeTop + elementHeight * 0.5

    const scrolled = scrollY - rotationPoint + elementHeight * 1.2
    const deg = Math.min(Math.max(-90, scrolled * 0.1), 0)

    const translateZ = Math.min(Math.max(0, scrolled * 0.1 + 90), 90) * 8
    const translateY = Math.min(Math.max(0, scrolled * 0.02), 50) * 2
    const opacity = Math.min(
      Math.max(0, (scrolled * 0.005 + 1) * (arrayLength - index + 1)),
      0.5
    )

    setTransformStyle(`perspective(1000px) rotateX(${deg}deg) translateZ(${translateZ}px) translateY(${translateY}px)`)
    setOpacityValue(1 - opacity)
  }, [arrayLength, index])

  React.useEffect(() => {
    const handleScroll = () => {
      calculatePosition()
    }
    
    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    
    return () => {
      window.removeEventListener("scroll", handleScroll)
    }
  }, [calculatePosition])

  // Update element properties with useEffect instead of inline styles
  React.useEffect(() => {
    if (card.current) {
      card.current.style.setProperty('--card-transform', transformStyle);
      card.current.style.setProperty('--card-opacity', String(opacityValue));
      card.current.style.setProperty('--card-z-index', String(20 - index));
    }
  }, [transformStyle, opacityValue, index]);

  return (
    <div
      ref={card}
      className={cn(
        "card-transformed",
        variants[variant].background,
        variants[variant].color,
        className
      )}
      data-index={index}
      data-z-index={20 - index}
      {...props}
    >
      {children}
    </div>
  )
}

export function ContainerScroll({
  children,
  className,
  ...props
}: ContainerScrollProps) {
  return (
    <div className={cn("container-scroll", className)} {...props}>
      {children}
    </div>
  )
}

export function ReviewStars({ rating, className }: ReviewStarsProps) {
  return (
    <div className="review-stars-container">
      {reviewStarsArray.map((_, i) => (
        <svg
          key={`star-${i}`}
          className={cn(
            "review-star",
            i < Math.floor(rating) ? className : "review-star-inactive"
          )}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
            clipRule="evenodd"
          />
        </svg>
      ))}
      <span className="review-rating">
        {rating.toString().replace(/\.\$/, "")}
      </span>
    </div>
  )
}
