<template>
  <div class="top-bar" :class="{ 'with-border': !isScrolledTopValue }">
    <div class="top-bar-content">
      <button v-if="!sidebarOpen" class="sidebar-toggle" @click="toggleSidebar" aria-label="Toggle sidebar">
        <Icon icon="material-symbols:side-navigation" width="24" height="24" />
      </button>
      <div class="model-selector-container">
        <DropdownMenuRoot>
          <DropdownMenuTrigger class="model-selector-btn"
            :aria-label="`Change model, currently ${props.selectedModelName}`">
            <span class="model-name-display">{{ props.selectedModelName }}</span>
            <Icon icon="material-symbols:keyboard-arrow-down-rounded" width="24" height="24" class="icon" />
          </DropdownMenuTrigger>

          <DropdownMenuContent class="model-selector-dropdown" side="bottom" align="start" :side-offset="8">
            <DropdownMenuLabel class="dropdown-label">Models</DropdownMenuLabel>
            <DropdownMenuSeparator />

            <!-- Scroll container to preserve dropdown scrolling while allowing submenus to render outside -->
            <div class="dropdown-scroll-container">
              <template v-for="item in availableModels" :key="item.id || item.category">
                <!-- Regular model (not in a category) -->
                <DropdownMenuItem v-if="!item.category" class="model-list-item"
                  :class="{ selected: item.id === props.selectedModelId }" @click="() => selectModel(item.id)">
                  <div class="model-info">
                    <strong>{{ item.name }}</strong>
                    <div class="model-description">{{ item.description }}</div>
                  </div>
                  <span v-if="item.id === props.selectedModelId">
                    <Icon icon="material-symbols:check-rounded" width="24" height="24" class="icon" />
                  </span>
                </DropdownMenuItem>

                <!-- Category with submodels -->
                <DropdownMenuSub v-else>
                  <DropdownMenuSubTrigger class="category-item">
                    {{ item.category }}
                    <Icon icon="material-symbols:chevron-right" width="24" height="24" class="icon" />
                  </DropdownMenuSubTrigger>

                  <DropdownMenuSubContent class="subcategory-content">
                    <DropdownMenuItem v-for="model in item.models" :key="model.id" class="model-list-item"
                      :class="{ selected: model.id === props.selectedModelId }" @click="() => selectModel(model.id)">
                      <div class="model-info">
                        <strong>{{ model.name }}</strong>
                        <div class="model-description">{{ model.description }}</div>
                      </div>
                      <span v-if="model.id === props.selectedModelId" class="selected-indicator">
                        <Icon icon="material-symbols:check-rounded" width="24" height="24" class="icon" />
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </template>
            </div>
          </DropdownMenuContent>
        </DropdownMenuRoot>
      </div>
      <div v-if="isIncognito && messages && messages.length > 0" class="incognito-indicator">
        <Icon icon="mdi:incognito" width="20" height="20" />
        <span class="incognito-text">Incognito mode</span>
      </div>
      <div class="action-toggles">
        <button v-if="showIncognitoButton" class="action-toggle incognito-toggle" :class="{ active: isIncognito }"
          @click="$emit('toggle-incognito')"
          :aria-label="isIncognito ? 'Disable incognito mode' : 'Enable incognito mode'">
          <Icon icon="mdi:incognito" width="20" height="20" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "reka-ui";
import { availableModels } from "../composables/availableModels";
import { Icon } from "@iconify/vue";

const props = defineProps({
  isScrolledTop: {
    type: [Boolean, Object],
    default: true
  },
  selectedModelName: {
    type: String,
    default: "Default Model",
  },
  selectedModelId: {
    type: String,
    default: "",
  },
  toggleSidebar: {
    type: Function,
    default: () => { }
  },
  sidebarOpen: {
    type: Boolean,
    default: false
  },
  isIncognito: {
    type: Boolean,
    default: false
  },
  showIncognitoButton: {
    type: Boolean,
    default: false
  },
  messages: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['model-selected']);

// Handle both direct boolean values and refs
const isScrolledTopValue = computed(() => {
  return typeof props.isScrolledTop === 'boolean'
    ? props.isScrolledTop
    : props.isScrolledTop.value;
});

function selectModel(modelId) {
  const selectedModel = availableModels.flatMap(item =>
    item.category ? item.models : item
  ).find((model) => model.id === modelId);

  if (selectedModel) {
    emit('model-selected', modelId, selectedModel.name);
  }
}
</script>

<style scoped>
/* Icon styling to ensure proper color inheritance */
.sidebar-toggle :deep(svg) {
  color: var(--text-primary);
}

.model-selector-btn :deep(svg) {
  color: var(--text-primary);
}

.model-list-item :deep(svg) {
  color: var(--text-primary);
}

.category-item :deep(svg) {
  color: var(--text-primary);
}

.top-bar-content {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  height: 100%;
  padding: 0 16px;
  gap: 12px;
}

.incognito-indicator {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 1.1rem;
  color: var(--text-secondary);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 8px;
}

.incognito-text {
  font-weight: 600;
}

.action-toggles {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.action-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  /* Make it spherical */
  background: none;

  cursor: pointer;
  padding: 0;
  margin: 0;
  transition: background 0.18s;
  color: var(--text-primary);
}

.action-toggle:hover {
  background: var(--btn-hover);
}

/* Add active state styling for when toggles are enabled */
.action-toggle:active,
.action-toggle.active {
  background-color: var(--primary);
  /* Use primary color when enabled */
  color: var(--primary-foreground);
  /* Ensure icon is visible on primary color */
}
</style>