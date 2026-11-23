
import React, { useEffect, useRef, useState } from 'react'
import Title from '../../components/owner/Title'
import { assets } from '../../assets/assets'
import { useAppContext } from '../../context/AppContext'
import toast from 'react-hot-toast'

const initialCarState = {
  brand: '',
  model: '',
  year: '',
  pricePerDay: '',
  category: '',
  transmission: '',
  fuel_type: '',
  seating_capacity: '',
  location: '',
  description: '',
}

const AddCar = () => {

  const { axios, currency } = useAppContext()

  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [car, setCar] = useState({ ...initialCarState })

  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiGenerated, setAiGenerated] = useState(false)
  const [aiError, setAiError] = useState('')

  const requestIdRef = useRef(0)
  const fileInputRef = useRef(null)

  // Manage image preview
  useEffect(() => {
    if (!image) {
      setImagePreview('')
      return
    }

    const url = URL.createObjectURL(image)
    setImagePreview(url)

    return () => URL.revokeObjectURL(url)
  }, [image])

  // Invalidate pending requests on unmount
  useEffect(() => {
    return () => {
      requestIdRef.current += 1
    }
  }, [])

  // Convert image to Base64
  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => {
        const result = reader.result

        if (typeof result !== 'string') {
          reject(new Error('Failed to read image'))
          return
        }

        resolve(result.split(',')[1])
      }

      reader.onerror = () => {
        reject(new Error('Failed to read image'))
      }

      reader.readAsDataURL(file)
    })
  }

  // Determine user-friendly AI error
  const getAiErrorMessage = (error) => {

    const status = error.response?.status
    const serverMessage = error.response?.data?.message || ''

    if (
        status === 503 ||
        /busy|high demand|overloaded/i.test(serverMessage)
      ) {
        return 'The Google Gemini AI model is currently experiencing high demand. This is a temporary service-side issue. Please enter the car details manually or try again later.'
      }

    if (status === 429) {
      return 'AI service is temporarily unavailable due to high demand. Please add the car details manually.'
    }

    if (status === 404) {
      return 'AI service is temporarily unavailable. Please add the car details manually.'
    }

    if (status === 413) {
      return 'The image is too large. Please upload a smaller image.'
    }

    if (status === 401 || status === 403) {
      return 'Unable to access AI service. Please check your login and try again.'
    }

    if (!error.response) {
      return 'Unable to connect to the AI service. Please add the car details manually.'
    }

    return 'The Google Gemini AI model is currently experiencing high demand. This is a temporary service-side issue. Please enter the car details manually or try again later.'
  }

  // Generate car details using AI
  const generateCarDetails = async (file) => {

    if (!file || isLoading) return

    const currentRequestId = ++requestIdRef.current

    try {
      setIsGenerating(true)
      setAiGenerated(false)
      setAiError('')

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp'
      ]

      if (!allowedTypes.includes(file.type)) {
        setAiError('Please upload a JPG, PNG or WebP image.')
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        setAiError('Image must be smaller than 5MB.')
        return
      }

      const base64Image = await convertToBase64(file)

      const { data } = await axios.post(
        '/api/owner/generate-car-details',
        {
          base64Image,
          mimeType: file.type
        }
      )

      // Ignore outdated AI responses
      if (currentRequestId !== requestIdRef.current) {
        return
      }

      if (data.success) {

        const details = data.carDetails

        const allowedCategories = [
          'Sedan',
          'SUV',
          'Van'
        ]

        const allowedTransmissions = [
          'Automatic',
          'Manual',
          'Semi-Automatic'
        ]

        const allowedFuelTypes = [
          'Gas',
          'Diesel',
          'Petrol',
          'Electric',
          'Hybrid'
        ]

        const category = allowedCategories.includes(details.category)
          ? details.category
          : ''

        const transmission = allowedTransmissions.includes(
          details.transmission
        )
          ? details.transmission
          : ''

        const fuelType = allowedFuelTypes.includes(details.fuel_type)
          ? details.fuel_type
          : ''

        // Fill form with AI-generated data
        setCar(prev => ({
          ...prev,
          brand: details.brand ?? '',
          model: details.model ?? '',
          year: details.year ?? '',
          category,
          transmission,
          fuel_type: fuelType,
          seating_capacity: details.seating_capacity ?? '',
          description: details.description ?? '',

          // Keep manually entered price and location
          pricePerDay: prev.pricePerDay,
          location: prev.location
        }))

        setAiGenerated(true)
        setAiError('')

        toast.success('Car details generated successfully!')

      } else {
        setAiError(
          /busy|high demand|unavailable/i.test(data.message || '')
            ? 'AI server is currently busy. Please add the car details manually.'
            : 'Unable to generate car details. Please fill in the details manually.'
        )
      }

    } catch (error) {

      if (currentRequestId !== requestIdRef.current) {
        return
      }

      console.error('AI Generation Error:', error)

      setAiError(getAiErrorMessage(error))

    } finally {

      if (currentRequestId === requestIdRef.current) {
        setIsGenerating(false)
      }

    }
  }

  // Handle image upload
  const handleImageChange = async (e) => {

    const file = e.target.files?.[0]

    if (!file || isLoading) return

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ]

    if (!allowedTypes.includes(file.type)) {
      toast.error('Please select a JPG, PNG or WebP image')
      e.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5MB')
      e.target.value = ''
      return
    }

    requestIdRef.current += 1

    setImage(file)
    setAiGenerated(false)
    setAiError('')

    // Reset image-related fields
    setCar(prev => ({
      ...initialCarState,
      pricePerDay: prev.pricePerDay,
      location: prev.location
    }))

    // Automatically generate details
    await generateCarDetails(file)
  }

  // Submit car listing
  const onSubmitHandler = async (e) => {

    e.preventDefault()

    if (isLoading || isGenerating) return

    if (!image) {
      toast.error('Please upload a car image')
      return
    }

    if (
      !car.brand.trim() ||
      !car.model.trim() ||
      !car.category ||
      !car.transmission ||
      !car.fuel_type ||
      !car.location ||
      !car.description.trim()
    ) {
      toast.error('Please fill in all required fields')
      return
    }

    if (
      !Number.isInteger(Number(car.year)) ||
      Number(car.year) < 1886 ||
      Number(car.year) > new Date().getFullYear() + 1
    ) {
      toast.error('Please enter a valid car year')
      return
    }

    if (
      !Number.isFinite(Number(car.pricePerDay)) ||
      Number(car.pricePerDay) <= 0
    ) {
      toast.error('Please enter a valid daily price')
      return
    }

    if (
      !Number.isInteger(Number(car.seating_capacity)) ||
      Number(car.seating_capacity) <= 0
    ) {
      toast.error('Please enter a valid seating capacity')
      return
    }

    setIsLoading(true)

    try {

      const formData = new FormData()

      formData.append('image', image)

      formData.append('carData', JSON.stringify({
        ...car,
        year: Number(car.year),
        pricePerDay: Number(car.pricePerDay),
        seating_capacity: Number(car.seating_capacity)
      }))

      const { data } = await axios.post(
        '/api/owner/add-car',
        formData
      )

      if (data.success) {

        toast.success(data.message)

        requestIdRef.current += 1

        // Reset form
        setImage(null)
        setCar({ ...initialCarState })
        setAiGenerated(false)
        setAiError('')
        setIsGenerating(false)

        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }

      } else {
        toast.error(data.message)
      }

    } catch (error) {

      console.error('Add Car Error:', error)

      toast.error(
        error.response?.data?.message ||
        error.message ||
        'Failed to add car'
      )

    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='px-4 py-10 md:px-10 flex-1'>

      <Title
        title="Add New Car"
        subTitle="Upload a car image to automatically generate details using AI, or enter the information manually."
      />

      <form
        onSubmit={onSubmitHandler}
        className='flex flex-col gap-5 text-gray-500 text-sm mt-6 max-w-xl'
      >

        {/* Car Image */}
        <div className='flex flex-col gap-3 w-full'>

          <div className='flex items-center gap-3'>

            <label htmlFor="car-image">

              <img
                src={imagePreview || assets.upload_icon}
                alt="Car preview"
                className='h-14 w-20 object-cover rounded cursor-pointer'
              />

              <input
                ref={fileInputRef}
                type="file"
                id="car-image"
                accept="image/jpeg,image/png,image/webp"
                hidden
                disabled={isLoading}
                onChange={handleImageChange}
              />

            </label>

            <div className='flex flex-col gap-1'>

              <p className='text-sm text-gray-500'>
                Upload a picture of your car
              </p>

              <p className='text-xs text-gray-400'>
                JPG, PNG or WebP (Max 5MB)
              </p>

            </div>

          </div>

          {/* AI Loading */}
          {isGenerating && (

            <div className='flex items-center gap-3 bg-blue-50 border border-blue-100 px-4 py-3 rounded-lg'>

              <div className='h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin'></div>

              <div className='flex flex-col'>

                <p className='text-blue-600 font-medium'>
                  AI is analyzing your car...
                </p>

                <p className='text-xs text-blue-500'>
                  Identifying brand, model and specifications
                </p>

              </div>

            </div>

          )}

          {/* AI Success */}
          {aiGenerated && !isGenerating && (

            <div className='flex flex-col gap-2 bg-green-50 border border-green-100 px-4 py-3 rounded-lg'>

              <div className='flex items-center gap-2'>

                <span className='text-green-600 text-lg'>✓</span>

                <p className='text-green-700 font-medium'>
                  AI details generated successfully!
                </p>

              </div>

              <p className='text-xs text-green-600'>
                Please review the generated details and fill in
                any missing information before listing.
              </p>

            </div>

          )}

          {/* AI Error - Manual Entry Fallback */}
          {aiError && !isGenerating && (

            <div
              role="alert"
              className='flex flex-col gap-2 bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg'
            >

              <div className='flex items-start gap-2'>

                <span className='text-amber-600 text-lg'>!</span>

                <div className='flex flex-col gap-1'>

                  <p className='text-amber-800 font-medium'>
                    AI Model Experiencing High Server Load
                  </p>

                  <p className='text-amber-700 text-sm'>
                    {aiError}
                  </p>

                  <p className='text-amber-600 text-xs mt-1'>
                    You can still list your car by filling in
                    the form below.
                  </p>

                </div>

              </div>

            </div>

          )}

          {/* Retry AI Generation */}
          {image && !isGenerating && !isLoading && (

            <button
              type="button"
              onClick={() => generateCarDetails(image)}
              className='flex items-center gap-2 text-primary font-medium w-max cursor-pointer hover:opacity-80'
            >
              <span>✦</span>
              {aiError
                ? 'Retry AI Generation'
                : 'Regenerate Details with AI'
              }
            </button>

          )}

        </div>

        {/* Brand and Model */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>

          <div className='flex flex-col w-full'>

            <label>Brand</label>

            <input
              type="text"
              placeholder="e.g. BMW, Mercedes, Audi..."
              required
              className='px-3 py-2 mt-1 border border-borderColor rounded-md outline-none'
              value={car.brand}
              onChange={e =>
                setCar({ ...car, brand: e.target.value })
              }
            />

          </div>

          <div className='flex flex-col w-full'>

            <label>Model</label>

            <input
              type="text"
              placeholder="e.g. X5, E-Class, M4..."
              required
              className='px-3 py-2 mt-1 border border-borderColor rounded-md outline-none'
              value={car.model}
              onChange={e =>
                setCar({ ...car, model: e.target.value })
              }
            />

          </div>

        </div>

        {/* Year, Price, Category */}
        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6'>

          <div className='flex flex-col w-full'>

            <label>Year</label>

            <input
              type="number"
              placeholder="2025"
              min="1886"
              max={new Date().getFullYear() + 1}
              required
              className='px-3 py-2 mt-1 border border-borderColor rounded-md outline-none'
              value={car.year}
              onChange={e =>
                setCar({ ...car, year: e.target.value })
              }
            />

          </div>

          <div className='flex flex-col w-full'>

            <label>Daily Price ({currency})</label>

            <input
              type="number"
              placeholder="100"
              min="0.01"
              step="0.01"
              required
              className='px-3 py-2 mt-1 border border-borderColor rounded-md outline-none'
              value={car.pricePerDay}
              onChange={e =>
                setCar({ ...car, pricePerDay: e.target.value })
              }
            />

          </div>

          <div className='flex flex-col w-full'>

            <label>Category</label>

            <select
              required
              onChange={e =>
                setCar({ ...car, category: e.target.value })
              }
              value={car.category}
              className='px-3 py-2 mt-1 border border-borderColor rounded-md outline-none'
            >
              <option value="">Select a category</option>
              <option value="Sedan">Sedan</option>
              <option value="SUV">SUV</option>
              <option value="Van">Van</option>
            </select>

          </div>

        </div>

        {/* Transmission, Fuel, Seating */}
        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6'>

          <div className='flex flex-col w-full'>

            <label>Transmission</label>

            <select
              required
              onChange={e =>
                setCar({ ...car, transmission: e.target.value })
              }
              value={car.transmission}
              className='px-3 py-2 mt-1 border border-borderColor rounded-md outline-none'
            >
              <option value="">Select a transmission</option>
              <option value="Automatic">Automatic</option>
              <option value="Manual">Manual</option>
              <option value="Semi-Automatic">Semi-Automatic</option>
            </select>

          </div>

          <div className='flex flex-col w-full'>

            <label>Fuel Type</label>

            <select
              required
              onChange={e =>
                setCar({ ...car, fuel_type: e.target.value })
              }
              value={car.fuel_type}
              className='px-3 py-2 mt-1 border border-borderColor rounded-md outline-none'
            >
              <option value="">Select a fuel type</option>
              <option value="Gas">Gas</option>
              <option value="Diesel">Diesel</option>
              <option value="Petrol">Petrol</option>
              <option value="Electric">Electric</option>
              <option value="Hybrid">Hybrid</option>
            </select>

          </div>

          <div className='flex flex-col w-full'>

            <label>Seating Capacity</label>

            <input
              type="number"
              placeholder="4"
              min="1"
              step="1"
              required
              className='px-3 py-2 mt-1 border border-borderColor rounded-md outline-none'
              value={car.seating_capacity}
              onChange={e =>
                setCar({
                  ...car,
                  seating_capacity: e.target.value
                })
              }
            />

          </div>

        </div>

        {/* Location */}
        <div className='flex flex-col w-full'>

          <label>Location</label>

          <select
            required
            onChange={e =>
              setCar({ ...car, location: e.target.value })
            }
            value={car.location}
            className='px-3 py-2 mt-1 border border-borderColor rounded-md outline-none'
          >
            <option value="">Select a location</option>
            <option value="New York">New York</option>
            <option value="Los Angeles">Los Angeles</option>
            <option value="Houston">Houston</option>
            <option value="Chicago">Chicago</option>
          </select>

        </div>

        {/* Description */}
        <div className='flex flex-col w-full'>

          <label>Description</label>

          <textarea
            rows={5}
            placeholder="e.g. A luxurious SUV with a spacious interior and a powerful engine."
            required
            className='px-3 py-2 mt-1 border border-borderColor rounded-md outline-none'
            value={car.description}
            onChange={e =>
              setCar({ ...car, description: e.target.value })
            }
          />

        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || isGenerating}
          className={`flex items-center gap-2 px-4 py-2.5 mt-4 bg-primary text-white rounded-md font-medium w-max transition-all ${
            isLoading || isGenerating
              ? 'opacity-60 cursor-not-allowed'
              : 'cursor-pointer hover:opacity-90'
          }`}
        >

          {isLoading || isGenerating ? (

            <div className='h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin'></div>

          ) : (

            <img src={assets.tick_icon} alt="" />

          )}

          {isLoading
            ? 'Listing...'
            : isGenerating
              ? 'Generating Details...'
              : 'List Your Car'
          }

        </button>

      </form>

    </div>
  )
}

export default AddCar
