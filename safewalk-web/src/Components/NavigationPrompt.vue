<template>
  <div v-if="currentStep && isNavigating" class="nav-prompt">
    <!-- Main instruction -->
    <div class="instruction-panel">
      <div class="step-arrow" :class="'arrow-' + (currentStep.maneuver || 'straight')">
        {{ getArrowEmoji(currentStep.maneuver) }}
      </div>
      <div class="instruction-content">
        <div class="instruction-text" v-html="currentStep.instruction"></div>
        <div class="distance-info">
          {{ formatDistanceForDisplay(currentStep.distance) }}
          <span v-if="currentStep.distance > 0" class="time-info">
            • {{ formatDuration(currentStep.duration) }}
          </span>
        </div>
      </div>
      <button class="speak-btn" @click="speakInstruction" title="Repeat instruction">
        🔊
      </button>
    </div>

    <!-- Progress bar showing steps -->
    <div class="steps-progress">
      <div 
        v-for="(step, i) in totalSteps" 
        :key="i"
        class="step-dot"
        :class="{ active: i === currentStepIndex, completed: i < currentStepIndex }"
      ></div>
    </div>

    <!-- Street view or next instruction preview -->
    <div v-if="nextStep" class="next-instruction">
      <span class="next-label">Next: </span>
      <span v-html="nextStep.plainInstruction"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { NavigationStep } from '@/Composables/useNavigationSteps'
import { formatDistanceForDisplay, formatDuration, playVoiceGuidance } from '@/Composables/useNavigationSteps'

interface Props {
  currentStep: NavigationStep | null
  currentStepIndex: number
  isNavigating: boolean
  totalSteps: number
  steps: NavigationStep[]
}

const props = withDefaults(defineProps<Props>(), {
  currentStep: null,
  currentStepIndex: 0,
  isNavigating: false,
  totalSteps: 0,
  steps: () => []
})

const nextStep = computed(() => {
  if (props.currentStepIndex + 1 < props.steps.length) {
    return props.steps[props.currentStepIndex + 1]
  }
  return null
})

// Auto-announce when step changes
let lastAnnouncedIndex = -1
watch(
  () => props.currentStepIndex,
  (newIdx) => {
    if (newIdx !== lastAnnouncedIndex && props.currentStep) {
      lastAnnouncedIndex = newIdx
      speakInstruction()
    }
  }
)

function getArrowEmoji(maneuver?: string): string {
  if (!maneuver) return '↗️'
  
  const m = maneuver.toLowerCase()
  if (m.includes('left')) return '↖️'
  if (m.includes('right')) return '↗️'
  if (m.includes('straight')) return '⬆️'
  if (m.includes('uturn')) return '🔄'
  
  return '➡️'
}

function speakInstruction() {
  if (props.currentStep) {
    playVoiceGuidance(props.currentStep.plainInstruction)
  }
}
</script>

<style scoped>
.nav-prompt {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  width: 90%;
  max-width: 500px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    transform: translateX(-50%) translateY(-30px);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

.instruction-panel {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
  color: white;
}

.step-arrow {
  font-size: 32px;
  flex-shrink: 0;
  animation: bounce 0.6s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

.instruction-content {
  flex: 1;
}

.instruction-text {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  margin-bottom: 4px;
}

.distance-info {
  font-size: 13px;
  opacity: 0.95;
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-info {
  opacity: 0.8;
}

.speak-btn {
  background: rgba(255, 255, 255, 0.25);
  border: none;
  color: white;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  font-size: 20px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.speak-btn:hover {
  background: rgba(255, 255, 255, 0.35);
  transform: scale(1.1);
}

.speak-btn:active {
  transform: scale(0.95);
}

.steps-progress {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 12px 16px;
  background: #f5f5f5;
}

.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ccc;
  transition: all 0.3s;
}

.step-dot.completed {
  background: #4caf50;
  transform: scale(0.8);
}

.step-dot.active {
  background: #1976d2;
  width: 12px;
  height: 12px;
  box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.2);
}

.next-instruction {
  padding: 12px 16px;
  font-size: 13px;
  color: #666;
  background: white;
  border-top: 1px solid #eee;
  line-height: 1.4;
}

.next-label {
  font-weight: 600;
  color: #333;
  margin-right: 4px;
}
</style>
