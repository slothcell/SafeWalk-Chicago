<template>
  <div class="crime-checkpoints-panel" v-if="checkpoints && checkpoints.length > 0">
    <div class="panel-header">
      <h4>⚠️ Active Crime Areas (Last 2 Hours)</h4>
      <button @click="togglePanel" class="collapse-btn">{{ expanded ? '−' : '+' }}</button>
    </div>
    
    <div v-if="expanded" class="panel-content">
      <div class="stats">
        <div class="stat">
          <span class="label">Total Incidents:</span>
          <span class="value">{{ totalCrimes }}</span>
        </div>
        <div class="stat">
          <span class="label">Critical:</span>
          <span class="badge critical">{{ criticalCount }}</span>
        </div>
        <div class="stat">
          <span class="label">High:</span>
          <span class="badge high">{{ highCount }}</span>
        </div>
      </div>
      
      <div class="checkpoints-list">
        <div 
          v-for="checkpoint in checkpoints" 
          :key="checkpoint.id"
          class="checkpoint-item"
          :class="'severity-' + checkpoint.severity"
          @click="highlightCheckpoint(checkpoint)"
        >
          <div class="checkpoint-header">
            <span class="severity-badge">{{ checkpoint.severity.toUpperCase() }}</span>
            <span class="crime-type">{{ checkpoint.type }}</span>
            <span class="count">{{ checkpoint.count }}</span>
          </div>
          <div class="checkpoint-details">
            <small>{{ checkpoint.primary }}</small>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Info tooltip for hovered checkpoint -->
  <div v-if="hoveredCheckpoint" class="checkpoint-tooltip">
    <strong>{{ hoveredCheckpoint.type }}</strong>
    <p>{{ hoveredCheckpoint.count }} incident{{ hoveredCheckpoint.count !== 1 ? 's' : '' }}</p>
    <p class="severity-label" :class="'severity-' + hoveredCheckpoint.severity">
      {{ hoveredCheckpoint.severity.toUpperCase() }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface CrimeCheckpoint {
  id: string
  lat: number
  lng: number
  count: number
  type: string
  primary: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  crimes: any[]
}

interface Props {
  checkpoints?: CrimeCheckpoint[]
}

const props = withDefaults(defineProps<Props>(), {
  checkpoints: () => []
})

const expanded = ref(true)
const hoveredCheckpoint = ref<CrimeCheckpoint | null>(null)

const emit = defineEmits<{
  highlight: [checkpoint: CrimeCheckpoint]
}>()

const totalCrimes = computed<number>(() => {
  if (!props.checkpoints) return 0
  return props.checkpoints.reduce((sum, cp) => sum + cp.count, 0)
})

const criticalCount = computed<number>(() => {
  if (!props.checkpoints) return 0
  return props.checkpoints.filter(cp => cp.severity === 'critical').length
})

const highCount = computed<number>(() => {
  if (!props.checkpoints) return 0
  return props.checkpoints.filter(cp => cp.severity === 'high').length
})

function togglePanel() {
  expanded.value = !expanded.value
}

function highlightCheckpoint(checkpoint: CrimeCheckpoint) {
  hoveredCheckpoint.value = checkpoint
  emit('highlight', checkpoint)
}
</script>

<style scoped>
.crime-checkpoints-panel {
  position: fixed;
  top: 80px;
  left: 20px;
  width: 320px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, #d32f2f 0%, #c62828 100%);
  color: white;
  font-weight: 600;
}

.panel-header h4 {
  margin: 0;
  font-size: 14px;
}

.collapse-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 0 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.panel-content {
  padding: 12px 16px;
  max-height: 400px;
  overflow-y: auto;
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e0e0e0;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat .label {
  font-size: 11px;
  color: #666;
  font-weight: 500;
}

.stat .value {
  font-size: 18px;
  font-weight: 700;
  color: #d32f2f;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.badge.critical {
  background: #d32f2f;
}

.badge.high {
  background: #f57c00;
}

.checkpoints-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkpoint-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 4px solid #999;
  background: #f5f5f5;
}

.checkpoint-item.severity-critical {
  border-left-color: #d32f2f;
  background: #ffebee;
}

.checkpoint-item.severity-critical:hover {
  background: #ffcdd2;
  transform: translateX(4px);
}

.checkpoint-item.severity-high {
  border-left-color: #f57c00;
  background: #fff3e0;
}

.checkpoint-item.severity-high:hover {
  background: #ffe0b2;
  transform: translateX(4px);
}

.checkpoint-item.severity-medium {
  border-left-color: #fbc02d;
  background: #fffde7;
}

.checkpoint-item.severity-medium:hover {
  background: #fff9c4;
  transform: translateX(4px);
}

.checkpoint-item.severity-low {
  border-left-color: #388e3c;
  background: #f1f8e9;
}

.checkpoint-item.severity-low:hover {
  background: #dcedc8;
  transform: translateX(4px);
}

.checkpoint-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.severity-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.7);
}

.crime-type {
  flex: 1;
  font-weight: 600;
  font-size: 13px;
  color: #333;
}

.count {
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 600;
}

.checkpoint-details {
  font-size: 12px;
  color: #666;
}

.checkpoint-tooltip {
  position: fixed;
  bottom: auto;
  top: 100px;
  left: 360px;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 12px;
  z-index: 101;
  max-width: 200px;
}

.checkpoint-tooltip strong {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
}

.checkpoint-tooltip p {
  margin: 2px 0;
}

.severity-label {
  margin-top: 6px !important;
  font-weight: 600;
}

.severity-label.severity-critical {
  color: #ff5252;
}

.severity-label.severity-high {
  color: #ffb74d;
}

/* Scrollbar styling */
.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: #999;
}
</style>
