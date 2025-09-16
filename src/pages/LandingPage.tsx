/**
 * Landing Page Component
 * FIXED: All CTA buttons now correctly route to internal Lanonasis pages
 */

import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  ArrowRight,
  Code2,
  Zap,
  Shield,
  Users,
  BarChart3,
  CheckCircle,
  Github,
  Twitter,
  Linkedin,
  Globe,
  Rocket,
  Key,
} from 'lucide-react'

export const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  
  const features = [
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Response times under 50ms with our optimized infrastructure',
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Bank-level encryption and security for your API calls',
    },
    {
      icon: Code2,
      title: 'Developer Friendly',
      description: 'Comprehensive SDKs for all major programming languages',
    },
    {
      icon: BarChart3,
      title: 'Real-time Analytics',
      description: 'Monitor your API usage with detailed insights and metrics',
    },
    {
      icon: Users,
      title: 'Team Collaboration',
      description: 'Manage team access and permissions with ease',
    },
    {
      icon: Globe,
      title: 'Global Infrastructure',
      description: 'Distributed across multiple regions for low latency',
    },
  ]
  
  const pricingPlans = [
    {
      name: 'Starter',
      price: 'Free',
      description: 'Perfect for getting started',
      features: [
        '1,000 API calls/month',
        '1 API key',
        'Community support',
        'Basic analytics',
      ],
      cta: 'Get Started',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '$49',
      period: '/month',
      description: 'For growing businesses',
      features: [
        '100,000 API calls/month',
        'Unlimited API keys',
        'Priority support',
        'Advanced analytics',
        'Custom domains',
        'SLA guarantee',
      ],
      cta: 'Start Free Trial',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      description: 'For large organizations',
      features: [
        'Unlimited API calls',
        'Dedicated infrastructure',
        '24/7 phone support',
        'Custom integrations',
        'On-premise deployment',
        'Custom SLA',
      ],
      cta: 'Contact Sales',
      highlighted: false,
    },
  ]
  
  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/dashboard')
    } else {
      navigate('/signup')
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Key className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Lanonasis API
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/docs"
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                Documentation
              </Link>
              <Link
                to="/pricing"
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                Pricing
              </Link>
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                  >
                    Login
                  </Link>
                  <Link
                    to="/signup"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
      
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Build Faster with
              <span className="text-blue-600 dark:text-blue-400"> Lanonasis API</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
              The most powerful API platform for modern applications. 
              Build, deploy, and scale your applications with enterprise-grade infrastructure.
            </p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={handleGetStarted}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center text-lg font-medium"
              >
                {isAuthenticated ? 'Access Dashboard' : 'Start Building'}
                <ArrowRight className="ml-2 h-5 w-5" />
              </button>
              <Link
                to="/docs"
                className="px-8 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center text-lg font-medium"
              >
                View Documentation
              </Link>
            </div>
          </div>
          
          {/* Code Example */}
          <div className="mt-16 max-w-4xl mx-auto">
            <div className="bg-gray-900 rounded-lg shadow-2xl p-6">
              <div className="flex items-center mb-4">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
                <span className="ml-4 text-gray-400 text-sm">api-example.js</span>
              </div>
              <pre className="text-gray-300 overflow-x-auto">
                <code>{`import { LanonasisAPI } from '@lanonasis/api-sdk'

const api = new LanonasisAPI({
  apiKey: process.env.LANONASIS_API_KEY
})

// Make your first API call
const response = await api.data.query({
  model: 'gpt-4',
  prompt: 'Hello, Lanonasis!'
})

console.log(response.data)`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="py-20 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Everything You Need to Build
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Powerful features to accelerate your development
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="p-6 bg-gray-50 dark:bg-gray-700 rounded-lg hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center mb-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                    <feature.icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* Pricing Section */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Choose the plan that fits your needs
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {pricingPlans.map((plan, index) => (
              <div
                key={index}
                className={`p-8 rounded-lg ${
                  plan.highlighted
                    ? 'bg-blue-600 text-white shadow-2xl scale-105'
                    : 'bg-white dark:bg-gray-800 shadow-lg'
                }`}
              >
                <h3 className={`text-2xl font-bold mb-2 ${
                  plan.highlighted ? 'text-white' : 'text-gray-900 dark:text-white'
                }`}>
                  {plan.name}
                </h3>
                <div className="mb-4">
                  <span className={`text-4xl font-bold ${
                    plan.highlighted ? 'text-white' : 'text-gray-900 dark:text-white'
                  }`}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className={`text-lg ${
                      plan.highlighted ? 'text-blue-100' : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <p className={`mb-6 ${
                  plan.highlighted ? 'text-blue-100' : 'text-gray-600 dark:text-gray-400'
                }`}>
                  {plan.description}
                </p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start">
                      <CheckCircle className={`h-5 w-5 mr-2 mt-0.5 ${
                        plan.highlighted ? 'text-white' : 'text-green-500'
                      }`} />
                      <span className={
                        plan.highlighted ? 'text-white' : 'text-gray-700 dark:text-gray-300'
                      }>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleGetStarted}
                  className={`w-full py-3 rounded-lg font-medium transition-colors ${
                    plan.highlighted
                      ? 'bg-white text-blue-600 hover:bg-gray-100'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-20 bg-blue-600 dark:bg-blue-700">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of developers building with Lanonasis API
          </p>
          <div className="flex justify-center space-x-4">
            <button
              onClick={handleGetStarted}
              className="px-8 py-3 bg-white text-blue-600 rounded-lg hover:bg-gray-100 transition-colors flex items-center text-lg font-medium"
            >
              <Rocket className="mr-2 h-5 w-5" />
              {isAuthenticated ? 'Go to Dashboard' : 'Start Free Trial'}
            </button>
            <Link
              to="/docs"
              className="px-8 py-3 border border-white text-white rounded-lg hover:bg-white/10 transition-colors flex items-center text-lg font-medium"
            >
              Read the Docs
            </Link>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <Key className="h-6 w-6 text-blue-400 mr-2" />
                <span className="text-lg font-semibold text-white">Lanonasis API</span>
              </div>
              <p className="text-sm">
                The most powerful API platform for modern applications.
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/features" className="hover:text-white">Features</Link></li>
                <li><Link to="/pricing" className="hover:text-white">Pricing</Link></li>
                <li><Link to="/docs" className="hover:text-white">Documentation</Link></li>
                <li><Link to="/api-status" className="hover:text-white">API Status</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/about" className="hover:text-white">About</Link></li>
                <li><Link to="/blog" className="hover:text-white">Blog</Link></li>
                <li><Link to="/careers" className="hover:text-white">Careers</Link></li>
                <li><Link to="/contact" className="hover:text-white">Contact</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Connect</h4>
              <div className="flex space-x-4">
                <a href="#" className="hover:text-white">
                  <Github className="h-5 w-5" />
                </a>
                <a href="#" className="hover:text-white">
                  <Twitter className="h-5 w-5" />
                </a>
                <a href="#" className="hover:text-white">
                  <Linkedin className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-sm text-center">
            <p>&copy; 2025 Lanonasis. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}