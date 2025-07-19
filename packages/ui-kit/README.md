# Lan Onasis UI Kit

A shared component library for the Lan Onasis monorepo ecosystem. This package provides reusable UI components, utilities, and styling to maintain consistency across all Lan Onasis applications.

## Installation

This package is internal to the Lan Onasis monorepo and is automatically available to all applications within it.

```bash
# From an app in the monorepo
npm install @lan-onasis/ui-kit
```

## Usage

```tsx
import { Button, LogoCarousel, DisplayCards } from '@lan-onasis/ui-kit';

export default function MyComponent() {
  return (
    <div>
      <Button variant="default">Click Me</Button>
      
      <LogoCarousel 
        logos={[
          { src: '/path/to/logo.png', alt: 'Company Name', href: 'https://example.com' }
        ]} 
        speed={30}
        pauseOnHover={true}
      />
      
      <DisplayCards 
        cards={[
          { 
            title: 'Feature One', 
            description: 'Description goes here',
            icon: YourIcon
          }
        ]}
      />
    </div>
  );
}
```

## Components

### Button

A versatile button component with various styles and sizes.

```tsx
<Button variant="default" size="default">Click Me</Button>
```

Variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
Sizes: `default`, `sm`, `lg`, `icon`

### Avatar

A flexible avatar component with image support and fallback text.

```tsx
<Avatar>
  <AvatarImage src="user-avatar.jpg" alt="User Name" />
  <AvatarFallback>UN</AvatarFallback>
</Avatar>
```

### DisplayCards

A component for displaying cards in a responsive grid layout with icons and descriptions.

```tsx
<DisplayCards
  cards={[
    { 
      title: "Fast Integration", 
      description: "Seamlessly integrate with existing systems",
      icon: Zap,
      date: "Updated: Jan 2025"
    }
  ]}
/>
```

### LogoCarousel

An infinitely scrolling carousel for displaying partner or client logos.

```tsx
<LogoCarousel
  logos={[
    { src: "/logos/client1.svg", alt: "Client 1", href: "https://client1.com" }
  ]}
  speed={40} // seconds for a full rotation
  direction="left"
  pauseOnHover={true}
/>
```

### Animated Cards Stack

A 3D scroll-reactive stack of cards, perfect for testimonials or featured content.

```tsx
<ContainerScroll>
  <CardsContainer className="h-[40rem]">
    <CardTransformed
      variant="dark"
      index={0}
      arrayLength={3}
      className="bg-slate-900 text-white"
    >
      <div>Your card content here</div>
      <ReviewStars rating={5} className="text-yellow-500" />
    </CardTransformed>
    {/* Additional cards */}
  </CardsContainer>
</ContainerScroll>
```

## Utilities

### cn

A utility function for conditionally joining Tailwind CSS classes together.

```tsx
import { cn } from '@lan-onasis/ui-kit';

function Component({ className }) {
  return <div className={cn('base-class', className)}></div>
}
```

## Development

### Adding New Components

1. Create your component in `src/components/[component-name].tsx`
2. Add any required styles to the appropriate CSS files in `src/styles/`
3. Export your component from `src/index.tsx`
4. Build the package with `npm run build`

### Building

```bash
# From the ui-kit package
npm run build