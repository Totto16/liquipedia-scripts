
#include <array>
#include <concepts>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <iostream>
#include <omp.h>
#include <stdexcept>
#include <utility>

#include "helper.hpp"
#include "permutations.hpp"
#include "teams.hpp"

struct Array {
	uint64_t size;
	uint64_t* data;
};

std::ostream& operator<<(std::ostream& os, const Array& array) {
	for(uint64_t i = 0; i < array.size; ++i) {
		if(i > 0) {
			os << " ";
		}
		os << unsigned(array.data[i]);
	}
	return os;
}

uint64_t factorial(const uint8_t n) {

	if(n <= 1) {
		return 1;
	}
	return factorial(n - 1) * n;
}

template <std::size_t T>
void increase_advancers(uint64_t (&result)[T], const std::array<Points, T>& points) {

	// TODO: also take into account MEA and EU (xD) guaranteed spot!

	std::vector<uint8_t> indices =
	    argSort<uint8_t>(points.cbegin(), points.cend(), std::greater<Points>());

	// top 6 advance
	for(uint8_t i = 0; i < 6; ++i) {
		const uint8_t index = indices[i];
		++result[index];
	}
}

template <std::size_t T, std::size_t A>
void updateStats(const uint8_t a[A], uint64_t (&result)[T], const uint8_t(&index),
                 const std::array<Points, T>& participating_team_points,
                 const Tournament& tournament) {

	std::array<Points, T> final_points = participating_team_points;
	for(uint8_t i = 0; i < A + 1; ++i) {
		// 1-16
		const uint8_t a_r = a[i - 1] - 1;
		const Place place = i == 0 ? index : (a_r >= index ? a_r + 1 : a_r);

		final_points[i] += tournament.points.at(place);
	}

	increase_advancers<T>(result, final_points);
}

using TeamResult = std::unordered_map<std::string, long double>;

#ifdef _WIN32
using LoopType = int8_t;
#else
using LoopType = uint8_t;
#endif

// n! options
template <std::size_t TEAM_AMOUNT, std::size_t PERMUTATIONS = TEAM_AMOUNT>
TeamResult allPermutations(const uint8_t alreadyPlayedTournaments) {
	constexpr uint8_t P = PERMUTATIONS;
	const uint64_t size = factorial(TEAM_AMOUNT - P);

	uint64_t data[TEAM_AMOUNT] = {};

	const Tournament tournament = get_current_tournament();

	const std::array<Team<4>, AMOUNT> teams = get_current_teams();

	const std::array<Team<4>, TEAM_AMOUNT> participating_teams =
	    get_participating_teams(alreadyPlayedTournaments);

	std::array<Points, TEAM_AMOUNT> participating_team_points{};
	for(uint8_t i = 0; i < TEAM_AMOUNT; ++i) {
		participating_team_points[i] = participating_teams[i].points;
	}

#pragma omp parallel
	{
		constexpr uint8_t Z = TEAM_AMOUNT - P;

#pragma omp for
		for(LoopType i = 0; i < Z; ++i) {

			uint64_t temp[TEAM_AMOUNT] = {};
			constexpr uint8_t A = Z - 1;

			QuickPerm<A>([&](uint8_t a[A]) {
				updateStats<TEAM_AMOUNT, A>(a, temp, static_cast<uint8_t>(i),
				                            participating_team_points, tournament);
			});

#pragma omp critical
			{
				for(uint8_t j = 0; j < TEAM_AMOUNT; ++j) {
					data[j] += temp[j];
				}
				std::cout << "Done loop " << static_cast<unsigned>(i) << "/" << TEAM_AMOUNT << "\n";
			}
		}
	}

	TeamResult result{};
	for(uint8_t i = 0; i < TEAM_AMOUNT; ++i) {
		result.insert_or_assign(participating_teams[i].name,
		                        static_cast<long double>(data[i]) / static_cast<long double>(size));
	}

	return result;
}

int main(void) {

	//  16! = 20.922.789.888.000

	// QuickPerm<6>([&](uint8_t a[6]) { display<6>(a); });
	TeamResult permutations = allPermutations<16, 8>(2);

	std::cout << "\n";
	for(auto const& [name, val] : permutations) {
		std::cout << name << " has gone to PGC " << (val * 100) << " % of ALL "
		          << "possible results"
		             "\n";
	}
	std::cout << "\n";
	for(auto const& [name, val] : permutations) {
		printf("%s, %0.12Lf\n", name.c_str(), val);
	}

	return 0;
}