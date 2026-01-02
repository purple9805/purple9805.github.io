/**
 * StreamVault Recommendation Engine
 * 
 * A sophisticated content recommendation system that analyzes viewing history
 * and suggests new content based on:
 * - Genre preferences
 * - Actor/Director preferences
 * - Thematic similarities
 * - Viewing patterns
 * - User ratings
 * 
 * @version 1.0.0
 * @license MIT
 */

class RecommendationEngine {
    constructor() {
        this.viewingHistory = [];
        this.userRatings = {};
        this.watchedMovies = new Set();
        this.preferences = {
            genres: {},
            actors: {},
            directors: {},
            themes: {},
            sources: {},
            decades: {}
        };
        this.recommendationCache = null;
        this.cacheTimestamp = null;
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        
        this.loadFromStorage();
    }

    // ========================================
    // DATA MANAGEMENT
    // ========================================

    /**
     * Record a movie view
     */
    recordView(movie, watchDuration = null, completed = false) {
        const viewRecord = {
            movieId: movie.id,
            timestamp: Date.now(),
            watchDuration: watchDuration,
            completed: completed,
            movie: movie
        };

        this.viewingHistory.push(viewRecord);
        this.watchedMovies.add(movie.id);
        
        // Update preferences based on this view
        this.updatePreferences(movie, completed ? 1.0 : 0.5);
        
        // Save to storage
        this.saveToStorage();
        
        // Clear recommendation cache
        this.clearCache();
        
        console.log(`[Recommendation] Recorded view: ${movie.title}`);
    }

    /**
     * Record user rating for a movie
     */
    rateMovie(movieId, rating) {
        this.userRatings[movieId] = {
            rating: rating, // 1-10
            timestamp: Date.now()
        };
        
        // Find the movie and update preferences with weighted rating
        const movie = this.findMovieInHistory(movieId);
        if (movie) {
            const weight = rating / 10; // Convert to 0-1 scale
            this.updatePreferences(movie, weight);
        }
        
        this.saveToStorage();
        this.clearCache();
        
        console.log(`[Recommendation] Recorded rating: ${movieId} - ${rating}/10`);
    }

    /**
     * Update user preferences based on movie attributes
     */
    updatePreferences(movie, weight = 1.0) {
        // Update genre preferences
        if (movie.genres && Array.isArray(movie.genres)) {
            movie.genres.forEach(genre => {
                this.preferences.genres[genre] = 
                    (this.preferences.genres[genre] || 0) + weight;
            });
        } else if (movie.genre) {
            this.preferences.genres[movie.genre] = 
                (this.preferences.genres[movie.genre] || 0) + weight;
        }

        // Update actor preferences
        if (movie.actors && Array.isArray(movie.actors)) {
            movie.actors.forEach(actor => {
                this.preferences.actors[actor] = 
                    (this.preferences.actors[actor] || 0) + weight;
            });
        }

        // Update director preferences
        if (movie.director) {
            this.preferences.directors[movie.director] = 
                (this.preferences.directors[movie.director] || 0) + weight;
        }

        // Update theme preferences
        if (movie.themes && Array.isArray(movie.themes)) {
            movie.themes.forEach(theme => {
                this.preferences.themes[theme] = 
                    (this.preferences.themes[theme] || 0) + weight;
            });
        }

        // Update source preferences
        if (movie.source) {
            this.preferences.sources[movie.source] = 
                (this.preferences.sources[movie.source] || 0) + weight;
        }

        // Update decade preferences
        if (movie.year) {
            const decade = Math.floor(parseInt(movie.year) / 10) * 10;
            this.preferences.decades[decade] = 
                (this.preferences.decades[decade] || 0) + weight;
        }
    }

    // ========================================
    // RECOMMENDATION ALGORITHMS
    // ========================================

    /**
     * Generate personalized recommendations
     */
    getRecommendations(allMovies, count = 10, options = {}) {
        // Check cache first
        if (this.isCacheValid()) {
            console.log('[Recommendation] Using cached recommendations');
            return this.recommendationCache.slice(0, count);
        }

        const {
            excludeWatched = true,
            minRating = 0,
            diversityFactor = 0.3 // 0 = similar content, 1 = diverse content
        } = options;

        console.log('[Recommendation] Generating new recommendations...');

        // Filter out watched movies if requested
        let candidateMovies = excludeWatched 
            ? allMovies.filter(m => !this.watchedMovies.has(m.id))
            : allMovies;

        // Filter by minimum rating if specified
        if (minRating > 0) {
            candidateMovies = candidateMovies.filter(m => 
                parseFloat(m.rating) >= minRating
            );
        }

        // If no viewing history, return popular/highly-rated content
        if (this.viewingHistory.length === 0) {
            return this.getColdStartRecommendations(candidateMovies, count);
        }

        // Score each movie
        const scoredMovies = candidateMovies.map(movie => ({
            movie: movie,
            score: this.calculateRecommendationScore(movie),
            breakdown: this.getScoreBreakdown(movie)
        }));

        // Sort by score
        scoredMovies.sort((a, b) => b.score - a.score);

        // Apply diversity if requested
        let recommendations;
        if (diversityFactor > 0) {
            recommendations = this.applyDiversityFilter(scoredMovies, count, diversityFactor);
        } else {
            recommendations = scoredMovies.slice(0, count);
        }

        // Cache the results
        this.recommendationCache = recommendations;
        this.cacheTimestamp = Date.now();

        console.log(`[Recommendation] Generated ${recommendations.length} recommendations`);
        
        return recommendations;
    }

    /**
     * Calculate recommendation score for a movie
     */
    calculateRecommendationScore(movie) {
        let score = 0;
        const weights = {
            genre: 0.35,
            actor: 0.20,
            director: 0.15,
            theme: 0.15,
            source: 0.05,
            decade: 0.05,
            rating: 0.05
        };

        // Genre similarity
        score += this.calculateGenreScore(movie) * weights.genre;

        // Actor similarity
        score += this.calculateActorScore(movie) * weights.actor;

        // Director similarity
        score += this.calculateDirectorScore(movie) * weights.director;

        // Theme similarity
        score += this.calculateThemeScore(movie) * weights.theme;

        // Source preference
        score += this.calculateSourceScore(movie) * weights.source;

        // Decade preference
        score += this.calculateDecadeScore(movie) * weights.decade;

        // Rating boost
        score += this.calculateRatingBoost(movie) * weights.rating;

        return score;
    }

    /**
     * Calculate genre similarity score
     */
    calculateGenreScore(movie) {
        let score = 0;
        const totalGenreWeight = Object.values(this.preferences.genres)
            .reduce((sum, weight) => sum + weight, 0);

        if (totalGenreWeight === 0) return 0;

        const movieGenres = movie.genres || [movie.genre];
        
        movieGenres.forEach(genre => {
            if (this.preferences.genres[genre]) {
                score += this.preferences.genres[genre] / totalGenreWeight;
            }
        });

        return score / Math.max(movieGenres.length, 1);
    }

    /**
     * Calculate actor similarity score
     */
    calculateActorScore(movie) {
        if (!movie.actors || movie.actors.length === 0) return 0;

        let score = 0;
        const totalActorWeight = Object.values(this.preferences.actors)
            .reduce((sum, weight) => sum + weight, 0);

        if (totalActorWeight === 0) return 0;

        movie.actors.forEach(actor => {
            if (this.preferences.actors[actor]) {
                score += this.preferences.actors[actor] / totalActorWeight;
            }
        });

        return score / movie.actors.length;
    }

    /**
     * Calculate director similarity score
     */
    calculateDirectorScore(movie) {
        if (!movie.director) return 0;

        const totalDirectorWeight = Object.values(this.preferences.directors)
            .reduce((sum, weight) => sum + weight, 0);

        if (totalDirectorWeight === 0) return 0;

        return (this.preferences.directors[movie.director] || 0) / totalDirectorWeight;
    }

    /**
     * Calculate theme similarity score
     */
    calculateThemeScore(movie) {
        if (!movie.themes || movie.themes.length === 0) return 0;

        let score = 0;
        const totalThemeWeight = Object.values(this.preferences.themes)
            .reduce((sum, weight) => sum + weight, 0);

        if (totalThemeWeight === 0) return 0;

        movie.themes.forEach(theme => {
            if (this.preferences.themes[theme]) {
                score += this.preferences.themes[theme] / totalThemeWeight;
            }
        });

        return score / movie.themes.length;
    }

    /**
     * Calculate source preference score
     */
    calculateSourceScore(movie) {
        if (!movie.source) return 0;

        const totalSourceWeight = Object.values(this.preferences.sources)
            .reduce((sum, weight) => sum + weight, 0);

        if (totalSourceWeight === 0) return 0;

        return (this.preferences.sources[movie.source] || 0) / totalSourceWeight;
    }

    /**
     * Calculate decade preference score
     */
    calculateDecadeScore(movie) {
        if (!movie.year) return 0;

        const decade = Math.floor(parseInt(movie.year) / 10) * 10;
        const totalDecadeWeight = Object.values(this.preferences.decades)
            .reduce((sum, weight) => sum + weight, 0);

        if (totalDecadeWeight === 0) return 0;

        return (this.preferences.decades[decade] || 0) / totalDecadeWeight;
    }

    /**
     * Calculate rating boost
     */
    calculateRatingBoost(movie) {
        const rating = parseFloat(movie.rating) || 0;
        return rating / 10; // Normalize to 0-1
    }

    /**
     * Get detailed score breakdown for debugging
     */
    getScoreBreakdown(movie) {
        return {
            genre: this.calculateGenreScore(movie),
            actor: this.calculateActorScore(movie),
            director: this.calculateDirectorScore(movie),
            theme: this.calculateThemeScore(movie),
            source: this.calculateSourceScore(movie),
            decade: this.calculateDecadeScore(movie),
            rating: this.calculateRatingBoost(movie)
        };
    }

    /**
     * Apply diversity filter to avoid recommending too similar content
     */
    applyDiversityFilter(scoredMovies, count, diversityFactor) {
        const selected = [];
        const genreCounts = {};
        const sourceCounts = {};

        for (const item of scoredMovies) {
            if (selected.length >= count) break;

            const movie = item.movie;
            const genre = movie.genre || 'unknown';
            const source = movie.source || 'unknown';

            // Calculate diversity penalty
            const genrePenalty = (genreCounts[genre] || 0) * diversityFactor;
            const sourcePenalty = (sourceCounts[source] || 0) * diversityFactor * 0.5;
            const adjustedScore = item.score - genrePenalty - sourcePenalty;

            if (adjustedScore > 0.1 || selected.length < 3) {
                selected.push(item);
                genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                sourceCounts[source] = (sourceCounts[source] || 0) + 1;
            }
        }

        return selected;
    }

    /**
     * Get recommendations for users with no viewing history
     */
    getColdStartRecommendations(movies, count) {
        console.log('[Recommendation] Using cold start recommendations');
        
        // Sort by rating and popularity
        const scored = movies.map(movie => ({
            movie: movie,
            score: parseFloat(movie.rating) || 0,
            breakdown: { coldStart: true }
        }));

        scored.sort((a, b) => b.score - a.score);
        
        // Add some diversity
        return this.applyDiversityFilter(scored, count, 0.5);
    }

    // ========================================
    // SPECIALIZED RECOMMENDATIONS
    // ========================================

    /**
     * Get "More Like This" recommendations for a specific movie
     */
    getMoreLikeThis(movie, allMovies, count = 6) {
        const candidates = allMovies.filter(m => 
            m.id !== movie.id && !this.watchedMovies.has(m.id)
        );

        const scored = candidates.map(candidate => {
            let similarity = 0;

            // Genre similarity (40%)
            const movieGenres = movie.genres || [movie.genre];
            const candidateGenres = candidate.genres || [candidate.genre];
            const genreOverlap = movieGenres.filter(g => candidateGenres.includes(g)).length;
            similarity += (genreOverlap / Math.max(movieGenres.length, 1)) * 0.4;

            // Actor similarity (25%)
            if (movie.actors && candidate.actors) {
                const actorOverlap = movie.actors.filter(a => candidate.actors.includes(a)).length;
                similarity += (actorOverlap / Math.max(movie.actors.length, 1)) * 0.25;
            }

            // Director similarity (20%)
            if (movie.director && candidate.director === movie.director) {
                similarity += 0.2;
            }

            // Theme similarity (15%)
            if (movie.themes && candidate.themes) {
                const themeOverlap = movie.themes.filter(t => candidate.themes.includes(t)).length;
                similarity += (themeOverlap / Math.max(movie.themes.length, 1)) * 0.15;
            }

            return {
                movie: candidate,
                score: similarity,
                breakdown: { similarity: similarity }
            };
        });

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, count);
    }

    /**
     * Get trending recommendations based on recent views
     */
    getTrendingRecommendations(allMovies, count = 10, timeWindowDays = 7) {
        const timeWindow = timeWindowDays * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - timeWindow;

        // Get recent viewing history
        const recentViews = this.viewingHistory.filter(v => v.timestamp >= cutoffTime);

        if (recentViews.length === 0) {
            return this.getRecommendations(allMovies, count);
        }

        // Create temporary preferences from recent views only
        const tempPreferences = {
            genres: {},
            actors: {},
            directors: {},
            themes: {}
        };

        recentViews.forEach(view => {
            const movie = view.movie;
            const weight = view.completed ? 1.0 : 0.5;

            // Update temporary preferences
            if (movie.genres) {
                movie.genres.forEach(g => {
                    tempPreferences.genres[g] = (tempPreferences.genres[g] || 0) + weight;
                });
            }
        });

        // Score movies based on recent preferences
        const candidates = allMovies.filter(m => !this.watchedMovies.has(m.id));
        const scored = candidates.map(movie => {
            let score = 0;
            const movieGenres = movie.genres || [movie.genre];
            
            movieGenres.forEach(genre => {
                score += tempPreferences.genres[genre] || 0;
            });

            return { movie, score, breakdown: { trending: true } };
        });

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, count);
    }

    /**
     * Get genre-specific recommendations
     */
    getGenreRecommendations(genre, allMovies, count = 10) {
        const candidates = allMovies.filter(m => {
            const movieGenres = m.genres || [m.genre];
            return movieGenres.includes(genre) && !this.watchedMovies.has(m.id);
        });

        // Score based on general preferences but within the genre
        const scored = candidates.map(movie => ({
            movie: movie,
            score: this.calculateRecommendationScore(movie),
            breakdown: { genre: genre }
        }));

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, count);
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    /**
     * Get user's top preferences
     */
    getTopPreferences(category = 'genres', limit = 5) {
        const prefs = this.preferences[category];
        if (!prefs) return [];

        return Object.entries(prefs)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([name, weight]) => ({ name, weight }));
    }

    /**
     * Get viewing statistics
     */
    getStatistics() {
        return {
            totalViews: this.viewingHistory.length,
            uniqueMovies: this.watchedMovies.size,
            totalRatings: Object.keys(this.userRatings).length,
            averageRating: this.calculateAverageRating(),
            topGenres: this.getTopPreferences('genres', 3),
            topActors: this.getTopPreferences('actors', 3),
            topDirectors: this.getTopPreferences('directors', 3),
            viewingStreak: this.calculateViewingStreak(),
            lastViewed: this.getLastViewed()
        };
    }

    /**
     * Calculate average user rating
     */
    calculateAverageRating() {
        const ratings = Object.values(this.userRatings);
        if (ratings.length === 0) return 0;

        const sum = ratings.reduce((total, r) => total + r.rating, 0);
        return (sum / ratings.length).toFixed(1);
    }

    /**
     * Calculate viewing streak
     */
    calculateViewingStreak() {
        if (this.viewingHistory.length === 0) return 0;

        let streak = 1;
        const oneDay = 24 * 60 * 60 * 1000;
        
        const sortedHistory = [...this.viewingHistory].sort((a, b) => b.timestamp - a.timestamp);
        
        for (let i = 0; i < sortedHistory.length - 1; i++) {
            const dayDiff = Math.floor((sortedHistory[i].timestamp - sortedHistory[i + 1].timestamp) / oneDay);
            if (dayDiff <= 1) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    /**
     * Get last viewed movie
     */
    getLastViewed() {
        if (this.viewingHistory.length === 0) return null;

        const sorted = [...this.viewingHistory].sort((a, b) => b.timestamp - a.timestamp);
        return sorted[0].movie;
    }

    /**
     * Find movie in viewing history
     */
    findMovieInHistory(movieId) {
        const view = this.viewingHistory.find(v => v.movieId === movieId);
        return view ? view.movie : null;
    }

    /**
     * Clear recommendation cache
     */
    clearCache() {
        this.recommendationCache = null;
        this.cacheTimestamp = null;
    }

    /**
     * Check if cache is valid
     */
    isCacheValid() {
        if (!this.recommendationCache || !this.cacheTimestamp) return false;
        return (Date.now() - this.cacheTimestamp) < this.CACHE_DURATION;
    }

    /**
     * Reset all data (for testing or user preference)
     */
    reset() {
        this.viewingHistory = [];
        this.userRatings = {};
        this.watchedMovies = new Set();
        this.preferences = {
            genres: {},
            actors: {},
            directors: {},
            themes: {},
            sources: {},
            decades: {}
        };
        this.clearCache();
        this.saveToStorage();
        console.log('[Recommendation] Engine reset');
    }

    // ========================================
    // STORAGE MANAGEMENT
    // ========================================

    /**
     * Save data to localStorage
     */
    saveToStorage() {
        try {
            const data = {
                viewingHistory: this.viewingHistory,
                userRatings: this.userRatings,
                watchedMovies: Array.from(this.watchedMovies),
                preferences: this.preferences,
                savedAt: Date.now()
            };
            
            localStorage.setItem('streamvault_recommendations', JSON.stringify(data));
            console.log('[Recommendation] Data saved to storage');
        } catch (error) {
            console.error('[Recommendation] Error saving to storage:', error);
        }
    }

    /**
     * Load data from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('streamvault_recommendations');
            if (stored) {
                const data = JSON.parse(stored);
                this.viewingHistory = data.viewingHistory || [];
                this.userRatings = data.userRatings || {};
                this.watchedMovies = new Set(data.watchedMovies || []);
                this.preferences = data.preferences || {
                    genres: {}, actors: {}, directors: {}, themes: {}, sources: {}, decades: {}
                };
                console.log('[Recommendation] Data loaded from storage');
                console.log(`[Recommendation] ${this.viewingHistory.length} views in history`);
            }
        } catch (error) {
            console.error('[Recommendation] Error loading from storage:', error);
        }
    }

    /**
     * Export data as JSON
     */
    exportData() {
        return {
            viewingHistory: this.viewingHistory,
            userRatings: this.userRatings,
            watchedMovies: Array.from(this.watchedMovies),
            preferences: this.preferences,
            statistics: this.getStatistics()
        };
    }

    /**
     * Import data from JSON
     */
    importData(data) {
        try {
            this.viewingHistory = data.viewingHistory || [];
            this.userRatings = data.userRatings || {};
            this.watchedMovies = new Set(data.watchedMovies || []);
            this.preferences = data.preferences || {
                genres: {}, actors: {}, directors: {}, themes: {}, sources: {}, decades: {}
            };
            this.saveToStorage();
            this.clearCache();
            console.log('[Recommendation] Data imported successfully');
        } catch (error) {
            console.error('[Recommendation] Error importing data:', error);
        }
    }
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecommendationEngine;
}
