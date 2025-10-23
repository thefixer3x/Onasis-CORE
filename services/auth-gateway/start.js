#!/usr/bin/env node
import { register } from 'tsx/esm/api'

register({
  hookExtensions: ['.ts'],
})

import('./src/index.ts')

