/**
 * OnboardingService - First-time user experience and interactive walkthrough
 *
 * Features:
 * - Welcome message on first activation
 * - Interactive step-by-step tour
 * - Feature highlights with contextual help
 * - Quick start guide
 * - Don't show again option with persistent state
 */
import * as vscode from 'vscode';
export declare class OnboardingService {
    private readonly context;
    private readonly outputChannel;
    constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel);
    /**
     * Check if user should see onboarding
     */
    checkAndShowOnboarding(): Promise<void>;
    /**
     * Show welcome message with tour options
     */
    private showWelcome;
    /**
     * Interactive step-by-step tour
     */
    private startInteractiveTour;
    /**
     * End the tour and mark as completed
     */
    private endTour;
    /**
     * Show quick start guide in webview
     */
    private showQuickStartGuide;
    /**
     * Generate Quick Start Guide HTML
     */
    private getQuickStartHTML;
    /**
     * Get onboarding state from workspace storage
     */
    private getOnboardingState;
    /**
     * Set onboarding state in workspace storage
     */
    private setOnboardingState;
    /**
     * Reset onboarding (for testing or re-running tour)
     */
    resetOnboarding(): void;
}
//# sourceMappingURL=OnboardingService.d.ts.map