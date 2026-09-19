import { describe, it, expect } from 'vitest'
import { stageAt } from './ModelTrainer'

describe('stageAt', () => {
  it('maps the clock to predict → compare → learn', () => {
    expect(stageAt(0)).toBe('predict')
    expect(stageAt(0.31)).toBe('predict')
    expect(stageAt(0.32)).toBe('compare')
    expect(stageAt(0.6)).toBe('compare')
    expect(stageAt(0.61)).toBe('learn')
    expect(stageAt(1)).toBe('learn')
  })
})
