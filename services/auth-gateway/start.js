#!/usr/bin/env node
import 'dotenv/config'
import { register } from 'tsx/esm/api'

register({
  hookExtensions: ['.ts'],
})

import('./src/index.ts')

