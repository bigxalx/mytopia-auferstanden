import * as fs from 'fs';

const PROCESSOR_CPP_PATH = "node_modules/react-native-audio-analyzer/cpp/Processor.cpp";

const patchCode = `#include "Processor.hpp"
#include "miniaudio.h"

#include <cmath>
#include <iostream>
#include <algorithm>
#include <vector>

#define LOG_TAG "HybridProcessor"

using namespace margelo::nitro::audioanalyzer;

std::vector<double> Processor::computeAmplitude(const std::string &filePath, double outputSampleCount)
{
    std::vector<double> result;
    size_t outputSampleCountInt = static_cast<size_t>(outputSampleCount);
    
    if (outputSampleCountInt == 0) {
        return result;
    }

    ma_decoder decoder;
    ma_decoder_config config = ma_decoder_config_init(ma_format_f32, 0, 0);
    ma_result initRes = ma_decoder_init_file(filePath.c_str(), &config, &decoder);
    
    if (initRes != MA_SUCCESS) {
        std::cerr << "Failed to init decoder for " << filePath << std::endl;
        return result;
    }

    ma_uint64 totalFrames = 0;
    if (ma_decoder_get_length_in_pcm_frames(&decoder, &totalFrames) != MA_SUCCESS || totalFrames == 0) {
        ma_decoder_uninit(&decoder);
        return result;
    }

    size_t totalSamples = static_cast<size_t>(totalFrames * decoder.outputChannels);
    size_t baseBlockSize = totalSamples / outputSampleCountInt;
    size_t remainder = totalSamples % outputSampleCountInt;

    size_t framesPerChunk = 4096;
    std::vector<float> chunkBuf(framesPerChunk * decoder.outputChannels);

    result.reserve(outputSampleCountInt);

    ma_uint64 framesReadResult = 0;
    
    // We will track our progress in terms of *samples* processed.
    size_t samplesProcessed = 0;
    size_t currentBlockIndex = 0;
    size_t currentBlockTargetSize = baseBlockSize + (currentBlockIndex < remainder ? 1 : 0);
    size_t currentBlockSamplesProcessed = 0;
    double currentBlockSum = 0.0;

    while (true) {
        ma_uint64 framesToRead = framesPerChunk;
        ma_result readRes = ma_decoder_read_pcm_frames(&decoder, chunkBuf.data(), framesToRead, &framesReadResult);
        
        if (framesReadResult == 0) {
            break; 
        }

        size_t samplesRead = static_cast<size_t>(framesReadResult * decoder.outputChannels);
        
        for (size_t i = 0; i < samplesRead; ++i) {
            currentBlockSum += std::abs(chunkBuf[i]);
            currentBlockSamplesProcessed++;

            if (currentBlockSamplesProcessed == currentBlockTargetSize) {
                // Yield block
                double avg = (currentBlockTargetSize > 0) ? (currentBlockSum / currentBlockTargetSize) : 0.0;
                result.push_back(avg);

                currentBlockIndex++;
                if (currentBlockIndex >= outputSampleCountInt) {
                    break;
                }
                
                currentBlockTargetSize = baseBlockSize + (currentBlockIndex < remainder ? 1 : 0);
                currentBlockSamplesProcessed = 0;
                currentBlockSum = 0.0;
            }
        }
        
        if (currentBlockIndex >= outputSampleCountInt) {
            break;
        }
    }

    // Wrap up processing
    ma_decoder_uninit(&decoder);

    // If we have remaining space, fill it up to outputSampleCount
    while (result.size() < outputSampleCountInt) {
        result.push_back(0.0);
    }

    return result;
}
`;

fs.writeFileSync(PROCESSOR_CPP_PATH, patchCode);
console.log("Patched Processor.cpp");
