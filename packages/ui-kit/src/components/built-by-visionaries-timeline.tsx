"use client";

import React, { useRef, useEffect, useState } from "react";
import "../styles/built-by-visionaries-timeline.css";
import {
  useMotionValueEvent,
  useScroll,
  useTransform,
  motion,
  AnimatePresence,
} from "framer-motion";
import { Building2, Users, Rocket, Trophy, Globe, Zap } from "lucide-react";

interface TimelineMilestone {
  year: string;
  title: string;
  description: string;
  icon: React.ElementType;
  status: "completed" | "current" | "upcoming";
}

interface BuiltByVisionariesTimelineProps {
  milestones?: TimelineMilestone[];
}

const defaultMilestones: TimelineMilestone[] = [
  {
    year: "2020",
    title: "The Genesis",
    description: "Founded with a vision to transform African tech landscape through innovative solutions.",
    icon: Building2,
    status: "completed"
  },
  {
    year: "2021",
    title: "VortexCore AI Launch",
    description: "Introduced our flagship AI platform, revolutionizing business intelligence and compliance.",
    icon: Rocket,
    status: "completed"
  },
  {
    year: "2022",
    title: "Regional Expansion",
    description: "Expanded operations to 5 African countries, serving over 100 enterprise clients.",
    icon: Users,
    status: "completed"
  },
  {
    year: "2023",
    title: "Innovation Award",
    description: "Recognized as \"Most Innovative FinTech Solution\" at Africa Tech Summit.",
    icon: Trophy,
    status: "completed"
  },
  {
    year: "2024",
    title: "Strategic Partnerships",
    description: "Formed key partnerships with major financial institutions across the continent.",
    icon: Globe,
    status: "current"
  },
  {
    year: "2025",
    title: "Global Recognition",
    description: "Achieved unicorn status and expanded services to international markets.",
    icon: Zap,
    status: "upcoming"
  }
];

export const BuiltByVisionariesTimeline: React.FC<BuiltByVisionariesTimelineProps> = ({ 
  milestones = defaultMilestones 
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setHeight(rect.height);
    }
  }, [ref]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 10%", "end 50%"],
  });

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);
  
  // Add dynamic styles to CSS variables on the container
  useEffect(() => {
    const updateCSSVariables = () => {
      if (containerRef.current) {
        containerRef.current.style.setProperty('--timeline-height', `${height}px`);
      }
    };
    
    updateCSSVariables();
  }, [height]);

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const newIndex = Math.floor(latest * milestones.length);
    setActiveIndex(Math.min(newIndex, milestones.length - 1));
  });

  // Status colors and text colors are now handled via CSS classes

  return (
    <div
      className="visionaries-timeline-container"
      ref={containerRef}
    >
      <div className="max-w-7xl mx-auto py-20 px-4 md:px-8 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
            Built by{" "}
            <span className="visionaries-title">
              Visionaries
            </span>
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl max-w-3xl mx-auto">
            What began as a quest for consulting excellence evolved into a revolutionary movement.
          </p>
        </motion.div>
      </div>

      <div ref={ref} className="visionaries-timeline-track relative max-w-7xl mx-auto pb-20">
        {milestones.map((milestone, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
            viewport={{ once: true, margin: "-100px" }}
            className="flex justify-start pt-10 md:pt-40 md:gap-10"
          >
            <div className="sticky flex flex-col md:flex-row z-40 items-center top-40 self-start max-w-xs lg:max-w-sm md:w-full">
              <motion.div 
                className={`h-16 w-16 absolute left-3 md:left-3 rounded-full bg-background border-4 flex items-center justify-center shadow-lg ${milestone.status === "completed" ? "visionaries-icon-completed" : milestone.status === "current" ? "visionaries-icon-current" : "visionaries-icon-upcoming"}`}
                whileHover={{ scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <milestone.icon className="h-8 w-8 text-white" />
              </motion.div>
              
              <div className="hidden md:block md:pl-24">
                <motion.h3 
                  className="text-3xl md:text-5xl font-bold text-foreground mb-2"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  {milestone.year}
                </motion.h3>
                <span className={`text-sm font-semibold uppercase tracking-wider ${milestone.status === "completed" ? "visionaries-text-completed" : milestone.status === "current" ? "visionaries-text-current" : "visionaries-text-upcoming"}`}>
                  {milestone.status}
                </span>
              </div>
            </div>

            <div className="relative pl-24 pr-4 md:pl-4 w-full">
              <div className="md:hidden mb-4">
                <h3 className="text-2xl font-bold text-foreground mb-1">
                  {milestone.year}
                </h3>
                <span className={`text-sm font-semibold uppercase tracking-wider ${milestone.status === "completed" ? "visionaries-text-completed" : milestone.status === "current" ? "visionaries-text-current" : "visionaries-text-upcoming"}`}>
                  {milestone.status}
                </span>
              </div>
              
              <motion.div
                className="bg-card border border-border rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300"
                whileHover={{ y: -5, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <h4 className="text-xl md:text-2xl font-bold text-foreground mb-4">
                  {milestone.title}
                </h4>
                <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
                  {milestone.description}
                </p>
                
                <motion.div
                  className="mt-4 flex items-center space-x-2"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className={`w-3 h-3 rounded-full ${milestone.status === "completed" ? "visionaries-icon-completed" : milestone.status === "current" ? "visionaries-icon-current" : "visionaries-icon-upcoming"}`} />
                  <span className="text-sm text-muted-foreground capitalize">
                    {milestone.status === "current" ? "In Progress" : milestone.status}
                  </span>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        ))}
        
        <div className="visionaries-timeline-line">
          <motion.div
            className="visionaries-timeline-line-progress"
            style={{
              // These transform values need to remain as inline styles
              // since they're dynamically updated by framer-motion
              height: heightTransform,
              opacity: opacityTransform,
            }}
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-10 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center visionaries-footer rounded-2xl p-8 md:p-12"
        >
          <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            The Journey Continues
          </h3>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            From this vision, Lan Onasis was born, fueling the VortexCore revolution and shaping the future of tech.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default BuiltByVisionariesTimeline;
